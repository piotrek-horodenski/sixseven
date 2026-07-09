import mongoose from 'mongoose'
import { beforeAll, afterAll, afterEach } from 'vitest'

// URI bazy testowej. Domyślnie standalone Mongo na 27017; w compose baza image
// (hydra-image-mongo) jest wystawiona na 27133 — integration config podaje wtedy
// właściwy TEST_DB_URI. Zawsze osobna baza (hydra_test), bo afterAll robi drop.
const TEST_DB_URI =
  process.env.TEST_DB_URI ?? 'mongodb://localhost:27017/hydra_test?directConnection=true'

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
