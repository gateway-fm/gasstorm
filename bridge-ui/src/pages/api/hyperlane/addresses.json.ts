import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';

/**
 * API route that serves the dynamically deployed Hyperlane addresses.
 *
 * The addresses.json file is mounted into the container by docker-compose
 * from the hyperlane-init deployment output.
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // Path where docker-compose mounts the hyperlane-config volume
  const configPath = '/config/addresses.json';

  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8');
      res.setHeader('Content-Type', 'application/json');
      res.status(200).send(data);
    } else {
      // Config not found - hyperlane-init may not have run
      res.status(404).json({
        error: 'Addresses not found',
        message: 'Hyperlane contracts may not be deployed. Run with bridge profile.'
      });
    }
  } catch (error) {
    res.status(500).json({
      error: 'Failed to read addresses',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
