/**
 * Revisa que node_modules coincida con package-lock.json. Lo usan los
 * launchers (INICIAR_RELAY.bat / .command) antes de arrancar el relay, para
 * que una actualización con `git pull` que agregue o cambie una dependencia
 * la instale sola en vez de romper el arranque.
 *
 * Sin dependencias y en sintaxis vieja a propósito: tiene que correr aunque
 * node_modules no exista y con el Node que tengan los Macs viejos.
 *
 * Código de salida:
 *   0 — todo instalado y en la versión del lockfile
 *   1 — falta algo: hay que instalar (sin eso el relay no arranca)
 *   2 — hay versiones distintas: conviene instalar, pero lo que hay funciona
 */

var fs = require('fs');
var path = require('path');

var RAIZ = path.resolve(__dirname, '..');

function leerJson(archivo) {
  try {
    return JSON.parse(fs.readFileSync(archivo, 'utf8'));
  } catch (error) {
    return null;
  }
}

// Paquetes esperados: los del lockfile (incluye los indirectos); sin lockfile,
// los de package.json.
function paquetesEsperados() {
  var lock = leerJson(path.join(RAIZ, 'package-lock.json'));
  var esperados = [];
  if (lock && lock.packages) {
    Object.keys(lock.packages).forEach(function (clave) {
      var info = lock.packages[clave];
      if (clave.indexOf('node_modules/') !== 0) return;
      if (info.dev || info.optional || info.link) return;
      esperados.push({ ruta: clave, version: info.version });
    });
    return esperados;
  }
  var paquete = leerJson(path.join(RAIZ, 'package.json')) || {};
  Object.keys(paquete.dependencies || {}).forEach(function (nombre) {
    esperados.push({ ruta: 'node_modules/' + nombre, version: null });
  });
  return esperados;
}

var faltan = [];
var distintos = [];

paquetesEsperados().forEach(function (paquete) {
  var nombre = paquete.ruta.replace(/^.*node_modules\//, '');
  var instalado = leerJson(path.join(RAIZ, paquete.ruta, 'package.json'));
  if (!instalado) {
    faltan.push(nombre);
  } else if (paquete.version && instalado.version !== paquete.version) {
    distintos.push(nombre + ' ' + instalado.version + ' -> ' + paquete.version);
  }
});

// Una instalación nueva tiene todo pendiente: basta con nombrar unos pocos.
function resumen(lista) {
  var unicos = lista.filter(function (item, i) { return lista.indexOf(item) === i; });
  if (unicos.length <= 4) return unicos.join(', ');
  return unicos.slice(0, 3).join(', ') + ' y ' + (unicos.length - 3) + ' mas';
}

if (faltan.length) {
  console.log('  Faltan dependencias: ' + resumen(faltan));
  process.exit(1);
}
if (distintos.length) {
  console.log('  Dependencias por actualizar: ' + resumen(distintos));
  process.exit(2);
}
process.exit(0);
