import mongoose from 'mongoose'
import { beforeAll, afterAll, afterEach } from 'vitest'

/**
 * Setup testów integracyjnych games. Łączy z REPLICA SETEM — transakcje
 * multi-dokumentowe (A2) go wymagają. Domyślnie celuje w replica set z
 * docker-compose (h2dbs, hydra-mongo1 wystawiony na hoście pod 27117);
 * nadpisz `TEST_DB_URI`, jeśli używasz innego.
 *
 * Baza jest testowa (games_test) — afterAll robi dropDatabase.
 */
const TEST_DB_URI =
  process.env.TEST_DB_URI ?? 'mongodb://localhost:27117/games_test?directConnection=true'

beforeAll(async () => {
  await mongoose.connect(TEST_DB_URI)
})

afterEach(async () => {
  const collections = await mongoose.connection.db!.collections()
  for (const col of collections) {
    await col.deleteMany({})
  }
})

afterAll(async () => {
  await mongoose.connection.db!.dropDatabase()
  await mongoose.disconnect()
})
