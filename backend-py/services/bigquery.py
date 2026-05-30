from google.cloud import bigquery
from google.api_core.client_options import ClientOptions
from google.auth.credentials import AnonymousCredentials


class BigQueryService:
    def __init__(
        self,
        project_id: str = "test-project",
        host: str = "http://localhost:9050",
    ):
        self.project_id = project_id

        self.client = bigquery.Client(
            project=project_id,
            client_options=ClientOptions(api_endpoint=host),
            credentials=AnonymousCredentials(),
        )

    def query(self, sql: str):
        """
        Execute SQL query and return rows.
        """
        query_job = self.client.query(sql)
        return list(query_job.result())

    def create_dataset(self, dataset_name: str):
        dataset_id = f"{self.project_id}.{dataset_name}"

        dataset = bigquery.Dataset(dataset_id)

        return self.client.create_dataset(
            dataset,
            exists_ok=True
        )

    def create_table(
        self,
        dataset_name: str,
        table_name: str,
        schema: list,
    ):
        table_id = (
            f"{self.project_id}."
            f"{dataset_name}."
            f"{table_name}"
        )

        table = bigquery.Table(
            table_id,
            schema=schema
        )

        return self.client.create_table(
            table,
            exists_ok=True
        )

    def insert_rows(
        self,
        dataset_name: str,
        table_name: str,
        rows: list[dict],
    ):
        table_id = (
            f"{self.project_id}."
            f"{dataset_name}."
            f"{table_name}"
        )

        errors = self.client.insert_rows_json(
            table_id,
            rows
        )

        if errors:
            raise Exception(errors)

    def close(self):
        self.client.close()


if __name__ == "__main__":
    bq = BigQueryService()

    # rows = bq.query("""
    #     SELECT *
    #     FROM events.all_events
    # """)

    query = """
    SELECT
            EXTRACT(YEAR FROM TIMESTAMP(event_timestamp)) AS year,
            EXTRACT(MONTH FROM TIMESTAMP(event_timestamp)) AS month,
            COUNT(DISTINCT CASE WHEN event_name IN ('send_create_session_request', 'ocr_session_init_request') THEN session_id END) AS ocr_started_count,
            COUNT(DISTINCT CASE WHEN event_name IN ('liveness_session_init_request', 'check_liveness_request') THEN session_id END) AS liveness_started_count,
            COUNT(DISTINCT CASE WHEN event_name = 'stt_recording_started' THEN session_id END) AS stt_started_count,
            COUNT(DISTINCT CASE WHEN event_name = 'face_match_responded_for_images' THEN session_id END) AS bio_ended_count
        FROM
            `events.all_events`
        WHERE
            company_id = '67cd5c8b1f2ebdcbb439afa5'
            AND DATE(event_timestamp) >= DATE('2026-01-01')
            AND DATE(event_timestamp) <= DATE('2027-01-01')
        GROUP BY
            year, month
        ORDER BY
            year, month
    """

    rows = bq.query(query)

    for row in rows:
        print(dict(row))