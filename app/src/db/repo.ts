// Punto di accesso unico ai dati per l'interfaccia: `import * as repo from '../db/repo'`.
// Ogni dominio ha il suo modulo in ./repositories; qui vengono solo riesportati.
export { init } from './connection';
export * from './repositories/patients';
export * from './repositories/visits';
export * from './repositories/payments';
export * from './repositories/appointments';
export * from './repositories/plans';
export * from './repositories/settings';
export * from './repositories/maintenance';
export * from './repositories/remote';
export { emptyPlanData, normalizePlanData, planKindOf, type PlanKind } from './planData';
