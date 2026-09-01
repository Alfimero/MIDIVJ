#!/bin/bash
# ---------------------------------------------------------------
#  MIDIVJ Relay — arranque en macOS (equivalente a INICIAR_RELAY.bat)
#
#  Doble clic sobre este archivo abre la Terminal y levanta el relay.
#  Si el doble clic no funciona, dale permiso una sola vez con:
#      chmod +x "INICIAR_RELAY.command"
#  o arráncalo escribiendo:  bash "INICIAR_RELAY.command"
# ---------------------------------------------------------------

VERDE=$'\033[0;32m'
ROJO=$'\033[0;31m'
NORMAL=$'\033[0m'

# Título de la ventana de Terminal
printf '\033]0;MIDIVJ Relay\007'

# Deja la ventana abierta para poder leer el mensaje antes de cerrar
pausa() {
  echo
  printf '  Pulsa ENTER para cerrar esta ventana… '
  read -r _
}

# error "resumen" ["detalle en varias líneas"]
error() {
  echo
  echo "${ROJO}  ERROR: $1${NORMAL}"
  if [ -n "$2" ]; then
    echo
    while IFS= read -r linea; do
      echo "  $linea"
    done <<DETALLE
$2
DETALLE
  fi
  pausa
  exit 1
}

echo "${VERDE}"
echo
echo "  ============================================="
echo "   MIDIVJ Relay"
echo "  ============================================="
echo "${NORMAL}"

# Carpeta del proyecto = carpeta padre de este script (aguanta espacios en la ruta)
cd "$(dirname "$0")/.." || error "no se pudo entrar a la carpeta del proyecto."
RAIZ="$(pwd)"
echo "  Carpeta: $RAIZ"
echo

if [ ! -f "src/midivj-relay.js" ]; then
  error "src/midivj-relay.js no encontrado." "Carpeta revisada: $RAIZ"
fi

MACOS="$(sw_vers -productVersion 2>/dev/null)"
NODE_16="https://nodejs.org/dist/v16.20.2/node-v16.20.2.pkg"

# Al abrir por doble clic, la Terminal no siempre carga el PATH de nvm o de
# Homebrew, así que juntamos los sitios donde node suele estar.
CANDIDATOS="$(command -v node 2>/dev/null)
/usr/local/bin/node
/opt/homebrew/bin/node
/usr/local/opt/node/bin/node"
for extra in "$HOME"/.nvm/versions/node/*/bin/node "$HOME"/node*/bin/node; do
  [ -x "$extra" ] && CANDIDATOS="$CANDIDATOS
$extra"
done

# No basta con que el archivo exista: un node compilado para un macOS más nuevo
# se instala sin protestar y muere al arrancar ("dyld: Symbol not found"). Por
# eso probamos cada candidato de verdad con `node -v` y nos quedamos con el
# primero que responda y sirva.
NODE=""
VERSION_NODE=""
NODE_ROTO=""
NODE_VIEJO=""
while IFS= read -r candidato; do
  [ -n "$candidato" ] && [ -x "$candidato" ] || continue
  version="$("$candidato" -v 2>/dev/null)"
  case "$version" in
    v[0-9]*)
      mayor="${version#v}"
      mayor="${mayor%%.*}"
      if [ "$mayor" -ge 14 ] 2>/dev/null; then
        NODE="$candidato"
        VERSION_NODE="$version"
        break
      fi
      [ -n "$NODE_VIEJO" ] || NODE_VIEJO="$candidato ($version)"
      ;;
    *)
      [ -n "$NODE_ROTO" ] || NODE_ROTO="$candidato"
      ;;
  esac
done <<LISTA
$CANDIDATOS
LISTA

if [ -z "$NODE" ] && [ -n "$NODE_ROTO" ]; then
  error "el Node.js instalado no puede ejecutarse en este Mac." "Binario: $NODE_ROTO
Tu macOS: ${MACOS:-desconocido}

El archivo existe, pero muere al arrancar: es una version de Node
compilada para un macOS mas nuevo que el tuyo. El instalador de Node
no avisa, se instala igual y falla despues.

Instala Node 16, la ultima que corre en Macs de esta epoca
(macOS 10.13 High Sierra hasta 10.15 Catalina):

    $NODE_16

El instalador reemplaza el node que no sirve. Al terminar, vuelve a
abrir este archivo."
fi

if [ -z "$NODE" ] && [ -n "$NODE_VIEJO" ]; then
  error "el Node.js instalado es demasiado viejo." "Encontrado: $NODE_VIEJO

MIDIVJ necesita Node 14 o superior. En un Mac de esta epoca, Node 16:

    $NODE_16"
fi

if [ -z "$NODE" ]; then
  error "Node.js no esta instalado (o no aparece en el PATH)." "Tu macOS: ${MACOS:-desconocido}

En un Mac reciente sirve la version LTS de https://nodejs.org
En un Mac de 2012 (macOS 10.13 a 10.15) necesitas Node 16:

    $NODE_16"
fi

# Que npm y los procesos hijos usen el mismo node que elegimos, no el que
# estuviera primero en el PATH.
PATH="$(dirname "$NODE"):$PATH"
export PATH

echo "  Node: $VERSION_NODE  ($NODE)"
[ -n "$MACOS" ] && echo "  macOS: $MACOS"
echo

if [ ! -d "node_modules/ws" ]; then
  echo "  Instalando dependencia \"ws\"…"
  if ! command -v npm >/dev/null 2>&1; then
    error "npm no esta disponible." "npm viene junto con Node.js: reinstalalo desde https://nodejs.org"
  fi
  if ! npm install --ignore-scripts; then
    error "no se pudo instalar la dependencia \"ws\"." "Revisa que haya conexion a internet y vuelve a intentar."
  fi
  echo
fi

echo "  Relay corriendo. No cierres esta ventana."
echo "  -----------------------------------------------"
echo
echo "  El navegador se abre solo con la aplicacion."
echo "  Abajo aparecen las direcciones reales (el puerto puede cambiar"
echo "  si el 9191 esta ocupado)."
echo
echo "  Para usar telefonos como mando, pulsa RELAY en la aplicacion"
echo "  y escanea el QR de cada uno (hasta 4 dispositivos)."
echo
echo "  Notas de macOS:"
echo "   - Si la aplicacion se abre en Safari, pegala en Chrome: Safari no"
echo "     soporta Web MIDI y no vera tu controlador."
echo "   - El nombre y la clave del Wi-Fi no se detectan solos; escribelos a"
echo "     mano en la ventana del QR si hace falta."
echo

"$NODE" src/midivj-relay.js

echo
echo "  -----------------------------------------------"
echo "  El relay se detuvo."
pausa
