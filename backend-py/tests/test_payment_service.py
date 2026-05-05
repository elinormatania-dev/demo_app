import pytest
from datetime import date

# Import your models and service
from models.company_configuration import (
    CompanyContractConfiguration,
    PaymentRules,
    Tier,
    BillingModel,
    Event
)
from services.payment_service import PaymentService


def test_ibi_sum_minus_minimum_calculation():
    # 1. ARRANGE: Set up the BigQuery results extracted from the image
    bq_results = {
        "ocr_started_count": 2769,
        "liveness_started_count": 1895,
        "stt_started_count": 1717,
        "bio_ended_count": 1681
    }

    # 2. ARRANGE: Construct the IBI Contract Configuration
    contract = CompanyContractConfiguration(
        company_id="ibi_test_id",
        contract_start_date=date(2024, 1, 1),
        contract_end_date=date(2026, 12, 31),
        billing_model=BillingModel.SUM_MINUS_MINIMUM,
        minimum_monthly_fee=2250.0,
        fixed_yearly_fee=0.0,
        payment_rules=[
            PaymentRules(
                event_name=Event.ocr_started,
                tiers=[Tier(from_num_actions=0, up_to_num_actions="unlimited", price_per_unit=1.0)]
            ),
            PaymentRules(
                event_name=Event.liveness_started,
                tiers=[Tier(from_num_actions=0, up_to_num_actions="unlimited", price_per_unit=0.5)]
            ),
            PaymentRules(
                event_name=Event.stt_started,
                tiers=[Tier(from_num_actions=0, up_to_num_actions="unlimited", price_per_unit=0.5)]
            ),
            PaymentRules(
                event_name=Event.bio_ended,
                tiers=[Tier(from_num_actions=0, up_to_num_actions="unlimited", price_per_unit=0.5)]
            )
        ]
    )

    # 3. ACT: Pass the data into the Math Engine
    result = PaymentService.calculate_invoice(bq_results, contract)

    # 4. ASSERT: Verify the math is perfectly accurate

    # Let's break down the expected math based on the image numbers:
    # OCR: 2769 * 1.0 = 2769.0
    # Liveness: 1895 * 0.5 = 947.5
    # STT: 1717 * 0.5 = 858.5
    # Bio: 1681 * 0.5 = 840.5
    # -----------------------------------
    # Total Raw Cost = 5415.5
    # Deductible Logic: 5415.5 - 2250.0 (minimum) = 3165.5
    # Final Check: Is 3165.5 greater than the 2250.0 minimum? Yes.
    # Expected Final Invoice: 3165.5

    expected_final_amount = 3165.5

    assert result["billing_model_applied"] == BillingModel.SUM_MINUS_MINIMUM.value
    assert result["invoice_status"] == "SUCCESS"
    assert result["minimum_fee_enforced"] == 2250.0
    assert result["final_invoice_amount"] == expected_final_amount

    # Ensure the raw counts were passed through correctly
    assert result["raw_database_counts"]["ocr_started_count"] == 2769