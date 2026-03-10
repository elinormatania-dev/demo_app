import 'dotenv/config';
import { BigQuery } from '@google-cloud/bigquery';

// Singleton BQ client — import this instead of creating a new BigQuery() in every service.
export const bigquery = new BigQuery({
  projectId: process.env.GCP_PROJECT_ID,
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});
