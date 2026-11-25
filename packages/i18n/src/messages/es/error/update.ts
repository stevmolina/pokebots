import type { PartialTranslation } from "../../../message";
import type { messages as source } from "../../en/error/update";

export const messages = {
  "error.update.unsupported": "Las actualizaciones están disponibles en las versiones de escritorio instaladas.",
  "error.update.notReady": "No hay ninguna actualización lista para instalar.",
  "error.update.restartFailed": "Pokebots no pudo reiniciarse para instalar la actualización.",
  "error.update.downloadStalled": "La descarga de la actualización dejó de responder. Inténtalo de nuevo.",
  "error.update.installFailed":
    "No se pudo instalar la actualización. Cierra y vuelve a abrir Pokebots e inténtalo de nuevo.",
  "error.update.jobOff": "Actualizaciones desactivadas.",
  "error.update.jobStartFailed":
    "No se pudieron volver a activar las actualizaciones. Ejecuta scripts/custom-auto-update-setup.sh en la copia de Pokebots.",
  "error.update.notInstalled": "El último reinicio no instaló la actualización. Reinicia para intentarlo de nuevo.",
  "error.update.downloadFailed": "No se pudo descargar la actualización. Inténtalo de nuevo.",
  "error.update.checkFailed": "No se pudieron buscar actualizaciones. Inténtalo de nuevo.",
  "error.update.checkStalled": "La búsqueda de actualizaciones dejó de responder. Inténtalo de nuevo.",
  "error.update.checkOffline":
    "No se pudo acceder al servicio de actualizaciones. Comprueba tu conexión a Internet e inténtalo de nuevo.",
  "error.update.checkUnavailable":
    "El servicio de actualizaciones no respondió. Pokebots lo volverá a intentar automáticamente en unos minutos.",
  "error.update.checkNoRelease":
    "No se encontró ninguna actualización publicada para esta plataforma. Pokebots lo volverá a intentar automáticamente en unos minutos.",
  "error.update.managedByNix": "Nix instala las actualizaciones de esta copia de Pokebots. Actualízala con Nix.",
  "error.update.managedByHost":
    "El host instala las actualizaciones en este Mac. La actualización permanecerá lista hasta que se ejecute el mantenimiento del host.",
  "error.update.siblingSession":
    "Otra sesión de Pokebots sigue ejecutándose desde esta aplicación. Primero detén Pokebots en todas las demás cuentas de usuario de macOS y vuelve a instalar la actualización.",
  "error.update.siblingSessionSameAccount":
    "Otro proceso de Pokebots sigue ejecutándose en esta cuenta de usuario. Ciérralo y vuelve a instalar la actualización.",
  "error.update.siblingCheckFailed":
    "No se pudieron verificar otras sesiones de Pokebots. Inténtalo de nuevo antes de instalar.",
  "error.update.readOnlyLocation":
    "Pokebots no puede instalar actualizaciones desde esta ubicación. Cierra Pokebots. En Finder, arrastra Pokebots a la carpeta Aplicaciones (si ya está allí, sácalo y vuelve a ponerlo). Después abre Pokebots e instala la actualización de nuevo.",
  "error.update.appImageMissing":
    "Pokebots no puede instalar la actualización porque su archivo AppImage se movió, se renombró o se reemplazó. Cierra Pokebots y vuelve a abrir el archivo AppImage.",
  "error.update.appImageReadOnly":
    "Pokebots no puede instalar actualizaciones en la carpeta de su archivo AppImage. Cierra Pokebots, mueve el archivo AppImage a una carpeta de tu carpeta personal, ábrelo e instala la actualización de nuevo.",
  "error.update.remoteDisabled":
    "Las actualizaciones por parte de administradores del servidor están desactivadas en este equipo.",
  "error.update.restartStarted": "Pokebots ya se está reiniciando para instalar la actualización.",
  "error.update.alreadyRestarting": "Pokebots ya se está reiniciando.",
} as const satisfies PartialTranslation<typeof source>;
