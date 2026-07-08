import mongoose from 'mongoose'
import { beforeAll, afterAll, afterEach } from 'vitest'

const TEST_DB_URI = 'mongodb://localhost:27017/hydra_test?directConnection=true'

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
