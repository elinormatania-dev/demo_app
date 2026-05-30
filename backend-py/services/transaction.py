from models.company_configuration import CompanyContractConfiguration, Event
from models.company_configuration import EVENT_TO_EVENT_NAMES


class TransactionService:
    def __init__(self, bigquery_service):
        self.bigquery_service = bigquery_service

    def get_transactions(self, bq_company_id: str, company_conf: CompanyContractConfiguration, start_date: str, end_date: str) -> list[dict]:
        query = self._build_transaction_query(bq_company_id, company_conf, start_date, end_date)
        results = self.bigquery_service.query(query)
        return [dict(res) for res in results]

    @staticmethod
    def _build_transaction_query(bq_company_id: str, company_conf: CompanyContractConfiguration, start_date: str,
                                end_date: str) -> str:
        payment_rules = company_conf.payment_rules
        count_statements = []

        for rule in payment_rules:
            conditions = []
            alias = ""


            # PATH 1: "You touch, you pay" (Umbrella tracking)
            if getattr(rule, "service_name", None):
                service_val = rule.service_name.value
                conditions.append(f"service_name = '{service_val}'")
                alias = f"{service_val}_count"

            # PATH 2: Granular tracking (Strict event completion)
            elif getattr(rule, "event_name", None):
                event_enum = rule.event_name
                raw_event_names = EVENT_TO_EVENT_NAMES.get(event_enum, [])

                # Skip if the enum isn't mapped in the dictionary
                if not raw_event_names:
                    continue

                if len(raw_event_names) == 1:
                    conditions.append(f"event_name = '{raw_event_names[0]}'")
                else:
                    event_names_str = ", ".join([f"'{name}'" for name in raw_event_names])
                    conditions.append(f"event_name IN ({event_names_str})")

                alias = f"{event_enum.value}_count"

            else:
                # If neither is provided (should be blocked by Pydantic), skip this rule
                continue

            # ==========================================================
            # GRANULAR MODIFIERS (flow_id and form_name)
            # ==========================================================

            flow_ids = getattr(rule, "flow_id", None)
            form_name = getattr(rule, "form_name", None)

            if flow_ids:
                if len(flow_ids) == 1:
                    conditions.append(f"flow_id = '{flow_ids[0]}'")
                else:
                    flow_id_str = ", ".join([f"'{f}'" for f in flow_ids])
                    conditions.append(f"flow_id IN ({flow_id_str})")

            if form_name:
                conditions.append(f"form_name = '{form_name}'")

            # ==========================================================
            # COMPILE THE SQL LINE
            # ==========================================================

            condition_str = " AND ".join(conditions)
            case_statement = f"COUNT(DISTINCT CASE WHEN {condition_str} THEN session_id END) AS {alias}"
            count_statements.append(case_statement)

        dynamic_counts = ",\n            ".join(count_statements)

        query = f"""
        SELECT 
            EXTRACT(YEAR FROM TIMESTAMP(event_timestamp)) AS year,
            EXTRACT(MONTH FROM TIMESTAMP(event_timestamp)) AS month,
            {dynamic_counts}
        FROM 
            `events.all_events`
        WHERE 
            company_id = '{bq_company_id}'
            AND DATE(event_timestamp) >= DATE('{start_date}')
            AND DATE(event_timestamp) <= DATE('{end_date}')
        GROUP BY 
            year, month
        ORDER BY 
            year, month
        """

        return query