from datetime import date
from models.company_configuration import (
    CompanyContractConfiguration, BillingModel, PaymentRules,
    Tier, Event, ServiceName
)
from services.transaction import BigQueryService

# Example: IBI Company Query
print("=" * 80)
print("IBI Company Query Example")
print("=" * 80)

ocr_tier = [Tier(from_num_actions=0, up_to_num_actions="unlimited", price_per_unit=1.0)]
half_price_tier = [Tier(from_num_actions=0, up_to_num_actions="unlimited", price_per_unit=0.5)]

ibi_rules = [
    PaymentRules(event_name=Event.ocr_started, tiers=ocr_tier),
    PaymentRules(event_name=Event.liveness_started, tiers=half_price_tier),
    PaymentRules(event_name=Event.stt_started, tiers=half_price_tier),
    PaymentRules(event_name=Event.bio_ended, tiers=half_price_tier)
]

contract = CompanyContractConfiguration(
    company_id="ibi_test",
    contract_start_date=date(2024, 1, 1),
    contract_end_date=date(2026, 12, 31),
    billing_model=BillingModel.SUM_MINUS_MINIMUM,
    minimum_monthly_fee=2250.0,
    fixed_yearly_fee=0.0,
    payment_rules=ibi_rules
)

service = BigQueryService()
query = service.build_transaction_query(
    company_id="6742fb13ac84281f527c322e",
    company_conf=contract,
    start_date="2026-03-01",
    end_date="2026-03-31"
)

print(query)
print("\n" + "=" * 80)
