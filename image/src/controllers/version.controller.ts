import { Request, Response } from 'express'

import { version } from '@/consts/version.const'

export async function getVersion(req: Request, res: Response): Promise<Response> {
  return res.json({
    version,
  })
}
