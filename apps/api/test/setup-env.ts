import 'reflect-metadata';
import { resetEnvCache } from '../src/config/env';
import { testDatabaseUrl } from './test-db';

// Every integration test process talks to the test database only.
process.env.DATABASE_URL = testDatabaseUrl();
process.env.NODE_ENV = 'test';
resetEnvCache();
