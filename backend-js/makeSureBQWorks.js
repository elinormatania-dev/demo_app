import 'dotenv/config'
import { BigQuery } from '@google-cloud/bigquery';

console.log("DEBUG: Project ID is:", process.env.GCP_PROJECT_ID);
console.log("DEBUG: Key Path is:", process.env.GOOGLE_APPLICATION_CREDENTIALS);

const bigquery = new BigQuery({
  projectId: process.env.GCP_PROJECT_ID,
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
});

async function testConnection() {
  console.log(`Checking connection to project: ${process.env.GCP_PROJECT_ID}...`);
  try {
    const [datasets] = await bigquery.getDatasets();
    console.log("Success! Your code is talking to BigQuery.");
    datasets.forEach(ds => console.log(` - Dataset: ${ds.id}`));
  } catch (err) {
    console.error("Connection failed:", err.message);
  }
}

testConnection();