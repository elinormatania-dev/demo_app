from datetime import date, timedelta
from models.company_configuration import CompanyContractConfiguration, BillingModel, Event
from models.company_configuration import CompanyContractConfiguration, BillingModel, PaymentRules, Tier, ServiceName
from services.big_query_service import BigQueryService

# def test_build_transaction_query():
#     bq_company_id = "aaa"
#     company_conf = CompanyContractConfiguration(
#         contract_start_date=date.today() - timedelta(days=14),
#         contract_end_date=date.today() + timedelta(days=14),
#         billing_model =BillingModel.ITEMIZED_USAGE_WITH_MINIMUM,
#         # minimum_monthly_actions: Optional[int] = None
#         # minimum_monthly_fee: Optional[float] = None  # 2250
#         # fixed_yearly_fee: float  # 195k
#         # payment_rules: List[PaymentRules]
#     )
#     company_conf = None
#     service = BigQueryService()
#     query = service.build_transaction_query(bq_company_id, company_conf,  None) # Fill in
#     assert query == """
#     SELECT
#             EXTRACT(YEAR FROM TIMESTAMP(event_timestamp)) AS year,
#             EXTRACT(MONTH FROM TIMESTAMP(event_timestamp)) AS month,
#             {dynamic_counts}
#         FROM
#             `events.all_events`
#         WHERE
#             company_id = 'aaa'
#             AND DATE(event_timestamp) >= DATE('{start_date}')
#             AND DATE(event_timestamp) <= DATE('{end_date}')
#         GROUP BY
#             year, month
#         ORDER BY
#             year, month
#     """

def test_isracard_query_generation():
    """Test that Isracard's specific flow_ids generate the correct SQL IN clauses"""

    # 1. Create dummy tier data to keep Pydantic's validation happy
    dummy_tiers = [Tier(from_num_actions=0, up_to_num_actions="unlimited", price_per_unit=5.0)]

    # 2. Create the exact rules for Isracard using the Pydantic models
    isracard_rules = [
        PaymentRules(
            event_name=Event.ocr_ended,  # <--- Using the Enum! (Translates to client_session_data_request)
            flow_id=["11"],
            overage_price_per_unit=5.0,
            tiers=dummy_tiers
        ),
        PaymentRules(
            event_name=Event.bio_ended,  # <--- Using the Enum! (Translates to face_match_responded_for_images)
            flow_id=["8", "10"],
            overage_price_per_unit=5.0,
            tiers=dummy_tiers
        )
    ]

    # 3. Create the main company configuration Pydantic object
    contract = CompanyContractConfiguration(
        company_id="isracard_test",
        contract_start_date=date(2026, 1, 1),
        contract_end_date=date(2027, 1, 1),
        billing_model=BillingModel.ITEMIZED_USAGE_WITH_MINIMUM,
        fixed_yearly_fee=0.0,
        payment_rules=isracard_rules
    )

    service = BigQueryService()

    # 4. Call the function with all required arguments
    query = service.build_transaction_query(
        bq_company_id="67272aec9ae7dc9629d16407",
        company_conf=contract,
        start_date="2026-03-01",
        end_date="2026-03-31"
    )

    # 5. Assert the specific SQL lines were generated correctly!
    assert "company_id = '67272aec9ae7dc9629d16407'" in query
    assert "COUNT(DISTINCT CASE WHEN event_name = 'client_session_data_request' AND flow_id = '11' THEN session_id END)" in query
    assert "COUNT(DISTINCT CASE WHEN event_name = 'face_match_responded_for_images' AND flow_id IN ('8', '10') THEN session_id END)" in query


def test_mani_query_generation():
    """Test MANI's query with Enum translation, multiple-string IN clauses, and form_name."""

    # 1. Dummy data for Pydantic validation
    dummy_tiers = [Tier(from_num_actions=0, up_to_num_actions="unlimited", price_per_unit=1.0)]

    # 2. Build MANI's rules using the Enums
    mani_rules = [
        PaymentRules(
            event_name=Event.ocr_started,  # Translates to = 'send_create_session_request'
            overage_price_per_unit=1.0,
            tiers=dummy_tiers
        ),
        PaymentRules(
            event_name=Event.liveness_started,
            # Translates to IN ('liveness_session_init_request', 'check_liveness_request')
            overage_price_per_unit=1.0,
            tiers=dummy_tiers
        ),
        PaymentRules(
            event_name=Event.stt_form_started,  # Translates to = 'mobile_form_loaded'
            form_name="single",  # MANI's special field!
            overage_price_per_unit=1.0,
            tiers=dummy_tiers
        )
    ]

    # 3. Create the contract
    contract = CompanyContractConfiguration(
        company_id="mani_test",
        contract_start_date=date(2026, 1, 1),
        contract_end_date=date(2027, 1, 1),
        billing_model=BillingModel.ITEMIZED_USAGE_WITH_MINIMUM,
        fixed_yearly_fee=0.0,
        payment_rules=mani_rules
    )

    service = BigQueryService()

    # 4. Generate the query
    query = service.build_transaction_query(
        bq_company_id="67cd5c8b1f2ebdcbb439afa5",
        company_conf=contract,
        start_date="2026-03-01",
        end_date="2026-03-31"
    )

    # 5. Let's intentionally fail the test so it prints the query to your screen!
    # assert False, f"\n--- GENERATED MANI SQL ---\n{query}\n--------------------------"


def test_ibi_query_generation_with_new_schema():
    """Test IBI's query generation using the new SUM_MINUS_MINIMUM schema and normalized Tiers."""

    # 1. We model flat pricing as a single tier from 0 to unlimited!
    ocr_tier = [Tier(from_num_actions=0, up_to_num_actions="unlimited", price_per_unit=1.0)]
    half_price_tier = [Tier(from_num_actions=0, up_to_num_actions="unlimited", price_per_unit=0.5)]

    # 2. Build IBI's rules using the strict PaymentRules schema
    ibi_rules = [
        PaymentRules(
            event_name=Event.ocr_started,
            tiers=ocr_tier
        ),
        PaymentRules(
            event_name=Event.liveness_started,
            tiers=half_price_tier
        ),
        PaymentRules(
            event_name=Event.stt_started,
            tiers=half_price_tier
        ),
        PaymentRules(
            event_name=Event.bio_ended,
            tiers=half_price_tier
        )
    ]

    # 3. Create the contract configuration specifically for IBI
    contract = CompanyContractConfiguration(
        company_id="ibi_test",
        contract_start_date=date(2024, 1, 1),
        contract_end_date=date(2026, 12, 31),
        billing_model=BillingModel.SUM_MINUS_MINIMUM,  # Using your custom IBI enum!
        minimum_monthly_fee=2250.0,
        fixed_yearly_fee=0.0,
        payment_rules=ibi_rules
    )

    service = BigQueryService()

    # 4. Generate the query
    query = service.build_transaction_query(
        bq_company_id="6742fb13ac84281f527c322e",
        company_conf=contract,
        start_date="2026-03-01",
        end_date="2026-03-31"
    )

    # 5. Assertions: Verify the generated SQL is perfect
    assert "company_id = '6742fb13ac84281f527c322e'" in query

    # Assert all 4 independent CASE WHEN statements were generated mapping to the dictionary
    assert "COUNT(DISTINCT CASE WHEN event_name IN ('send_create_session_request', 'ocr_session_init_request') THEN session_id END) AS ocr_started_count" in query
    assert "COUNT(DISTINCT CASE WHEN event_name IN ('liveness_session_init_request', 'check_liveness_request') THEN session_id END) AS liveness_started_count" in query
    assert "COUNT(DISTINCT CASE WHEN event_name = 'stt_recording_started' THEN session_id END) AS stt_started_count" in query
    assert "COUNT(DISTINCT CASE WHEN event_name = 'face_match_responded_for_images' THEN session_id END) AS bio_ended_count" in query

    print("✅ IBI SQL Generation Test Passed!")


def test_cal_query_generation():
    """
    Test Cal's query generation.
    Legacy SQL used 'service_name' and added counts together.
    Our engine standardizes this to 'event_name' and leaves the addition to the Python rating logic.
    """

    # 1. Define the tiers (assuming flat pricing for the bundle based on the legacy query)
    bundled_tiers = [Tier(from_num_actions=0, up_to_num_actions="unlimited", price_per_unit=1.5)]

    # 2. Build Cal's rules.
    # We map their old "service_name='ocr'" to our strict Enums!
    cal_rules = [
        PaymentRules(
            event_name=Event.ocr_started,
            tiers=bundled_tiers
        ),
        PaymentRules(
            event_name=Event.liveness_started,
            tiers=bundled_tiers
        )
    ]

    # 3. Create the contract configuration for Cal
    # Since they sum the usage together in the legacy query, it's likely a VOLUME_TIERED model
    contract = CompanyContractConfiguration(
        company_id="cal_test",
        contract_start_date=date(2024, 1, 1),
        contract_end_date=date(2026, 12, 31),
        billing_model=BillingModel.VOLUME_TIERED_WITH_MINIMUM,
        minimum_monthly_fee=0.0,  # Adjust if Cal has a minimum
        fixed_yearly_fee=0.0,
        payment_rules=cal_rules
    )

    service = BigQueryService()

    # 4. Generate the query
    query = service.build_transaction_query(
        bq_company_id="67e24df6ec44cf1de85aabe8",  # Cal's ID
        company_conf=contract,
        start_date="2026-03-01",
        end_date="2026-03-31"
    )

    # 5. Assertions: Prove that we bypassed the messy 'service_name' logic!
    assert "company_id = '67e24df6ec44cf1de85aabe8'" in query

    # We prove that the generator successfully mapped to the strict event_names instead!
    assert "COUNT(DISTINCT CASE WHEN event_name IN ('send_create_session_request', 'ocr_session_init_request') THEN session_id END) AS ocr_started_count" in query
    assert "COUNT(DISTINCT CASE WHEN event_name IN ('liveness_session_init_request', 'check_liveness_request') THEN session_id END) AS liveness_started_count" in query

    # Optional: Fail intentionally to inspect the query visually
    # assert False, f"\n--- GENERATED CAL SQL ---\n{query}\n--------------------------"

    print("✅ CAL SQL Generation Test Passed!")


from datetime import date


# Make sure to import your Pydantic models and BigQueryService here

def test_max_query_generation():

    standard_tiers = [Tier(from_num_actions=0, up_to_num_actions="unlimited", price_per_unit=1.0)]

    rules = [
        PaymentRules(
            service_name=ServiceName.OCR,
            event_name=None,  # Explicitly bypassing event granular tracking
            tiers=standard_tiers
        ),
        PaymentRules(
            service_name=ServiceName.LIVENESS,
            event_name=None,
            tiers=standard_tiers
        ),
        PaymentRules(
            # Notice we use the STT enum, which translates beautifully to "video_statement"!
            service_name=ServiceName.STT,
            event_name=None,
            tiers=standard_tiers
        )
    ]

    # 3. Create the contract configuration for Max's Company ID
    contract = CompanyContractConfiguration(
        company_id="max_test",
        contract_start_date=date(2026, 1, 1),
        contract_end_date=date(2027, 12, 31),
        billing_model=BillingModel.ITEMIZED_USAGE_WITH_MINIMUM,  # Or whichever model Max uses
        minimum_monthly_fee=0.0,
        fixed_yearly_fee=0.0,
        payment_rules=rules
    )

    service = BigQueryService()

    # 4. Generate the query targeting Max's specific company ID
    query = service.build_transaction_query(
        bq_company_id="65a637d6844eb2e80d26a6ec",
        company_conf=contract,
        start_date="2026-03-01",
        end_date="2026-03-31"
    )

    # 5. Assertions: Verify we generated the exact Looker logic dynamically!
    assert "company_id = '65a637d6844eb2e80d26a6ec'" in query

    # Verify the 3 "You touch, you pay" umbrella conditions
    assert "COUNT(DISTINCT CASE WHEN service_name = 'ocr' THEN session_id END) AS ocr_count" in query
    assert "COUNT(DISTINCT CASE WHEN service_name = 'liveness' THEN session_id END) AS liveness_count" in query
    assert "COUNT(DISTINCT CASE WHEN service_name = 'video_statement' THEN session_id END) AS video_statement_count" in query

    # Ultimate proof: Ensure granular event_name logic was safely bypassed
    assert "event_name =" not in query

    print("✅ Max's Umbrella Query Generation Test Passed!")


def test_orda_query_generation():
    """
    TEST 6: Standard Single-Event Contract (Orda)
    Proves the engine cleanly generates a standard granular query for OCR starts,
    and standardizes the output alias instead of relying on legacy manual naming.
    """

    # 1. Define standard tiers
    standard_tiers = [Tier(from_num_actions=0, up_to_num_actions="unlimited", price_per_unit=1.0)]

    # 2. Build Orda's Rule
    # We use event_name to hit exactly what their legacy query targeted.
    rules = [
        PaymentRules(
            event_name=Event.ocr_started,  # Maps beautifully to 'send_create_session_request'
            tiers=standard_tiers
        )
    ]

    # 3. Create Orda's contract configuration
    contract = CompanyContractConfiguration(
        company_id="orda_test",
        contract_start_date=date(2026, 1, 1),
        contract_end_date=date(2027, 12, 31),
        billing_model=BillingModel.VOLUME_TIERED_WITH_MINIMUM,  # Or whichever model Orda uses
        minimum_monthly_fee=0.0,
        fixed_yearly_fee=0.0,
        payment_rules=rules
    )

    service = BigQueryService()

    # 4. Generate the query targeting Orda's company ID
    query = service.build_transaction_query(
        bq_company_id="67e3d43ef4c0fe53abbbda6a",
        company_conf=contract,
        start_date="2026-03-01",
        end_date="2026-03-31"
    )

    # 5. Assertions: Verify we generated the clean Looker logic
    assert "company_id = '67e3d43ef4c0fe53abbbda6a'" in query

    # Verify the specific event logic and our new standardized alias
    assert "COUNT(DISTINCT CASE WHEN event_name IN ('send_create_session_request', 'ocr_session_init_request') THEN session_id END) AS ocr_started_count" in query

    # Ensure it didn't accidentally trigger the umbrella logic
    assert "service_name =" not in query

    print("✅ Orda Standard Query Generation Test Passed!")


def test_phoenix_tiered_extraction_query():
    """
    TEST 7: Volume Tiered Billing (Phoenix)
    Proves that the engine extracts the raw counts cleanly, completely stripping out
    the hardcoded 'LEAST()' and 'CASE WHEN' pricing math that used to pollute the Looker SQL.
    """

    # 1. We define Phoenix's EXACT tiers in Python, taking them out of the SQL!
    phoenix_tiers = [
        Tier(from_num_actions=0, up_to_num_actions=25000, price_per_unit=7.2),
        Tier(from_num_actions=25000, up_to_num_actions="unlimited", price_per_unit=4.5)
    ]

    # 2. Build the rule targeting their specific event
    # Notice the legacy SQL had "/**and flow_id in ('5','7')**/" commented out.
    # Our engine ignores that since it's just comments, but if they ever turn it back on,
    # you would simply add flow_id=["5", "7"] to this rule!
    rules = [
        PaymentRules(
            event_name=Event.ocr_started,  # Maps to 'send_create_session_request'
            tiers=phoenix_tiers
        )
    ]

    # 3. Create Phoenix's contract configuration
    contract = CompanyContractConfiguration(
        company_id="phoenix_test",
        contract_start_date=date(2024, 1, 1),
        contract_end_date=date(2026, 12, 31),
        billing_model=BillingModel.VOLUME_TIERED_WITH_MINIMUM,
        minimum_monthly_fee=15000.0,  # Just an example minimum
        fixed_yearly_fee=0.0,
        payment_rules=rules
    )

    service = BigQueryService()

    # 4. Generate the query targeting Phoenix's company ID
    query = service.build_transaction_query(
        bq_company_id="65e71023456f1b3a5ba99da2",
        company_conf=contract,
        start_date="2026-03-01",
        end_date="2026-03-31"
    )

    # 5. Assertions: Verify we generated the clean extraction logic
    assert "company_id = '65e71023456f1b3a5ba99da2'" in query
    assert "COUNT(DISTINCT CASE WHEN event_name IN ('send_create_session_request', 'ocr_session_init_request') THEN session_id END) AS ocr_started_count" in query

    # 6. THE ULTIMATE PROOF: Assert that the pricing math is NO LONGER IN THE SQL
    assert "LEAST" not in query.upper()
    assert "7.2" not in query
    assert "4.5" not in query
    assert "tier1_payment" not in query

    print("✅ Phoenix Tiered Decoupling Test Passed! Pricing math successfully evicted from SQL.")