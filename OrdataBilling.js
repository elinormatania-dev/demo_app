import { BigQuery } from "@google-cloud/bigquery"

const OrdataBilling = `with Orda
as (
select  EXTRACT(MONTH FROM TIMESTAMP(event_timestamp)) AS month,
EXTRACT(YEAR FROM TIMESTAMP(event_timestamp)) AS year,
DATE(TIMESTAMP_TRUNC(event_timestamp, MONTH))  as DATE,
COUNT(DISTINCT CASE WHEN event_name = 'send_create_session_request' THEN session_id END) AS TotalTransToCharge
from \`events.all_events\`
where company_id in ('67e3d43ef4c0fe53abbbda6a')
group by month,year,DATE
order by year asc, month asc
)


select 'Orda' as client, 
DATE,
MONTH,
YEAR,
TotalTransToCharge,
case when DATE >= '2026-03-01'  and ((TotalTransToCharge * 2.5) <= 2700) then 2700 
when DATE >= '2026-03-01'  and ((TotalTransToCharge * 2.5) > 2700) then TotalTransToCharge * 2.5 
when DATE < '2026-03-01'  and ((TotalTransToCharge * 2.5) <= 2000) then 2000 
when DATE < '2026-03-01'  and ((TotalTransToCharge * 2.5) > 2000) then  TotalTransToCharge * 2.5
 end as total_payment,
'Dollar' as currency 
from Orda `


