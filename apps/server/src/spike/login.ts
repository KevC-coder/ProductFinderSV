import { paths } from '../config.js';
import { interactiveLogin } from '../scraper/session.js';

console.log('Abriendo Microsoft Edge con el perfil de productFindersv...');
console.log('→ Inicia sesión en Facebook en esa ventana (tienes 5 minutos).');
console.log('  La app NO ve ni guarda tu contraseña; solo reutiliza la sesión del perfil:');
console.log(`  ${paths.browserProfile}\n`);

const ok = await interactiveLogin();
if (ok) {
  console.log('✅ Sesión de Facebook detectada y guardada. Ya puedes correr: npm run spike -- --query "iphone 13"');
} else {
  console.log('❌ No se detectó la sesión (tiempo agotado, ventana cerrada o verificación pendiente).');
  process.exitCode = 1;
}
