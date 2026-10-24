import pg from 'pg';
import { databaseConfig } from './config.js';

export const pool = new pg.Pool(databaseConfig());
// Never log driver errors: messages can contain SQL, hostnames, or credentials.
pool.on('error', () => console.error('Unexpected idle PostgreSQL connection error'));
