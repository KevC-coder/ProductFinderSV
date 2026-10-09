import type { FastifyError, FastifyInstance, FastifySchemaValidationError } from 'fastify';

/** Nombres legibles de los campos que valida la API. */
const FIELD_LABELS: Record<string, string> = {
  name: 'Nombre',
  query: 'Texto de búsqueda',
  mustKeywords: 'Keywords obligatorias',
  mustMode: 'Modo de las obligatorias',
  bonusKeywords: 'Keywords deseables',
  excludeKeywords: 'Keywords excluidas',
  searchDescription: 'Buscar en la descripción',
  minPrice: 'Precio mínimo',
  maxPrice: 'Precio máximo',
  idealPrice: 'Precio ideal',
  locationSlug: 'Ciudad',
  radiusKm: 'Radio',
  conditions: 'Condición',
  maxAgeHours: 'Antigüedad máxima',
  runsPerDay: 'Veces al día',
  windowStart: 'Hora de inicio',
  windowEnd: 'Hora de fin',
  maxDetails: 'Máximo de descripciones',
  active: 'Activa',
  status: 'Estado',
  browserMode: 'Modo del navegador',
};

function fieldName(e: FastifySchemaValidationError): string {
  // "/excludeKeywords/3" → "Keywords excluidas"
  const key = e.instancePath.split('/').filter(Boolean)[0] ?? String(e.params.missingProperty ?? '');
  return FIELD_LABELS[key] ?? key;
}

/** Traduce un error de validación (ajv) a una frase en español para el usuario. */
function describeValidationError(e: FastifySchemaValidationError): string {
  const f = fieldName(e);
  switch (e.keyword) {
    case 'required':
      return `Falta el campo “${FIELD_LABELS[String(e.params.missingProperty)] ?? e.params.missingProperty}”.`;
    case 'additionalProperties':
      return `Campo no permitido: “${String(e.params.additionalProperty)}”.`;
    case 'minimum':
      return `${f}: debe ser como mínimo ${e.params.limit}.`;
    case 'maximum':
      return `${f}: debe ser como máximo ${e.params.limit}.`;
    case 'minLength':
      return `${f}: no puede estar vacío.`;
    case 'maxLength':
      return `${f}: es demasiado largo (máximo ${e.params.limit} caracteres).`;
    case 'maxItems':
      return `${f}: demasiados elementos (máximo ${e.params.limit}).`;
    case 'uniqueItems':
      return `${f}: hay elementos repetidos.`;
    case 'pattern':
      return `${f}: formato no válido.`;
    case 'enum':
      return `${f}: valor no permitido.`;
    case 'type':
      return `${f}: tipo de dato no válido.`;
    case 'minProperties':
      return 'No hay cambios para guardar.';
    default:
      return `${f}: valor no válido.`;
  }
}

/** Respuestas de error uniformes: { error: "mensaje en español" }. */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (err.validation?.length) {
      return reply.code(400).send({ error: describeValidationError(err.validation[0]!) });
    }
    if (err.statusCode && err.statusCode < 500) {
      return reply.code(err.statusCode).send({ error: err.message });
    }
    req.log.error(err);
    return reply.code(500).send({ error: 'Error interno del servicio. Revisa los registros.' });
  });
}
