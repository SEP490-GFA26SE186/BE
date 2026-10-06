from app.core.usage import UsageAccumulator, estimate_cost_micros


def test_cost_zero_prices(settings) -> None:
    assert estimate_cost_micros(1650, 1320, settings) == 0


def test_cost_integer_division(settings) -> None:
    s = settings.model_copy(
        update={
            "price_text_input_per_mtok_micros": 1_250_000,
            "price_text_output_per_mtok_micros": 10_000_000,
        }
    )
    # 1650 * 1_250_000 // 1_000_000 = 2062 ; 1320 * 10_000_000 // 1_000_000 = 13200
    assert estimate_cost_micros(1650, 1320, s) == 2062 + 13200


def test_accumulator_two_calls_one_response(settings) -> None:
    acc = UsageAccumulator()
    acc.start_call()
    acc.add_response(100, 50)
    acc.start_call()  # e.g. a second call that failed with a network error
    assert acc.attempts == 2
    assert acc.has_response

    usage = acc.to_usage("mock", "mock-v1", 123, settings)
    assert usage.attempts == 2
    assert (usage.input_tokens, usage.output_tokens) == (100, 50)
    assert usage.units == 0
    assert usage.latency_ms == 123
    assert (usage.provider, usage.model) == ("mock", "mock-v1")


def test_accumulator_sums_responses(settings) -> None:
    acc = UsageAccumulator()
    for tokens in ((10, 20), (30, 40)):
        acc.start_call()
        acc.add_response(*tokens)
    usage = acc.to_usage("mock", None, 0, settings)
    assert (usage.input_tokens, usage.output_tokens, usage.attempts) == (40, 60, 2)


def test_accumulator_cost_uses_settings(settings) -> None:
    s = settings.model_copy(update={"price_text_output_per_mtok_micros": 1_000_000})
    acc = UsageAccumulator()
    acc.start_call()
    acc.add_response(10, 500)
    assert acc.to_usage("mock", None, 0, s).estimated_cost_micros == 500


def test_accumulator_without_response() -> None:
    acc = UsageAccumulator()
    acc.start_call()
    assert acc.attempts == 1
    assert not acc.has_response
