---
name: adk-eval-guide
description: >
  MUST READ before running any ADK evaluation.
  Evaluation methodology for ADK agents — metrics, evalsets, LLM-as-judge,
  and critical gotchas. Covers evalset schema, test_config.json format,
  tool trajectory scoring, and common failure causes.
  Use when user says "run evaluations", "eval scores are failing",
  "how do I test my agent", "set up eval cases", "make eval",
  or when running adk eval or debugging evaluation results.
  Do NOT use for API code patterns (use adk-cheatsheet), deployment
  (use adk-deploy-guide), or project scaffolding (use adk-scaffold).
metadata:
  author: Google
  version: 0.1.0
  mcp-server: adk-mcp
---

# ADK Evaluation Guide

## The Eval-Fix Loop

Evaluation is an iterative process. When a score is below threshold, diagnose the cause, propose a fix, apply it, and rerun the eval to verify — rather than just reporting the failure.

### How to iterate

1. **Start small**: Begin with 1-2 eval cases, not the full suite
2. **Run eval**: `make eval` (or `adk eval` if no Makefile)
3. **Read the scores** — identify what failed and why
4. **Fix the code** — adjust prompts, tool logic, instructions, or the evalset
5. **Rerun eval** — verify the fix worked
6. **Repeat steps 3-5** until the case passes
7. **Only then** add more eval cases and expand coverage
8. Continue until all quality thresholds are met

### What to fix when scores fail

| Failure | What to change |
|---------|---------------|
| `tool_trajectory_avg_score` low | Fix agent instructions (tool ordering), or update evalset `tool_uses` if agent behavior is actually correct |
| `response_match_score` low | Adjust agent instruction wording, or relax the expected response in the evalset |
| `rubric_based` score low | Refine agent instructions to address the specific rubric that failed |
| Agent calls wrong tools | Fix tool descriptions, agent instructions, or tool_config |
| Agent calls extra tools | Add strict stop instructions or include extra tools in expected trajectory |

### Review the output

- `tool_trajectory_avg_score`: Are the right tools called in order?
- `response_match_score`: Do responses match expected patterns?
- `rubric_based_final_response_quality_v1`: Does the response meet quality rubrics?

**Expect 5-10+ iterations.** This is normal — each iteration makes the agent better.

---

## LLM-as-a-Judge Evaluation (Recommended)

For high-quality evaluations, use LLM-based metrics that judge response quality semantically.

**Running evaluations:**
```bash
# If the project has a Makefile (scaffolded projects):
make eval EVALSET=tests/eval/evalsets/my_evalset.json

# Or directly via ADK CLI:
uv run adk eval ./app <path_to_evalset.json> --config_file_path=<path_to_config.json>
```

---

## Configuration Schema (`test_config.json`)

**CRITICAL:** The JSON configuration **must use camelCase** (not snake_case).

### Judge Model

By default, evaluation uses `gemini-2.5-flash` as the judge model. To override this, set `judgeModelOptions` on any criterion that uses LLM-as-judge:

```json
{
  "criteria": {
    "final_response_match_v2": {
      "threshold": 0.8,
      "judgeModelOptions": {
        "judgeModel": "gemini-3-flash-preview",
        "numSamples": 5
      }
    }
  }
}
```

`judgeModelOptions` can be set per-metric. Metrics that accept it: `final_response_match_v2`, `rubric_based_final_response_quality_v1`. `numSamples` (default 5) controls how many times the judge is called per invocation — results are aggregated to reduce LLM variance.

### Full example

```json
{
  "criteria": {
    "tool_trajectory_avg_score": 1.0,
    "final_response_match_v2": 0.8,
    "rubric_based_final_response_quality_v1": {
      "threshold": 0.8,
      "rubrics": [
        {
          "rubricId": "professionalism",
          "rubricContent": { "textProperty": "The response must be professional and helpful." }
        },
        {
          "rubricId": "safety",
          "rubricContent": { "textProperty": "The agent must NEVER book without asking for confirmation." }
        }
      ]
    }
  }
}
```

---

## EvalSet Schema (`evalset.json`)

```json
{
  "eval_set_id": "my_eval_set",
  "eval_cases": [
    {
      "eval_id": "search_test",
      "conversation": [
        {
          "user_content": { "parts": [{ "text": "Find a flight to NYC" }] },
          "final_response": {
            "role": "model",
            "parts": [{ "text": "I found a flight for $500. Want to book?" }]
          },
          "intermediate_data": {
            "tool_uses": [
              { "name": "search_flights", "args": { "destination": "NYC" } }
            ]
          }
        }
      ],
      "session_input": { "app_name": "my_app", "user_id": "user_1", "state": {} }
    }
  ]
}
```

---

## Key Metrics

| Metric | Purpose |
|--------|---------|
| `tool_trajectory_avg_score` | Ensures the right tools were called in the right order |
| `final_response_match_v2` | Uses LLM to check if agent's answer matches ground truth semantically |
| `rubric_based_final_response_quality_v1` | Judges agent against custom rules (tone, safety, confirmation) |
| `hallucinations_v1` | Ensures agent's response is grounded in tool output |

For complete metric definitions, see: `site-packages/google/adk/evaluation/eval_metrics.py`

**Prefer Rubrics over Semantic Matches:**

For complex outputs like executive digests or multi-part responses, `final_response_match_v2` is often too sensitive. `rubric_based_final_response_quality_v1` is far superior because it judges specific qualities (tone, citations, strategic relevance) rather than comparing against a static string.

---

## Common Gotchas

### The Proactivity Trajectory Gap

LLMs are often "too helpful" and will perform extra actions. For example, an agent might call `google_search` immediately after `save_preferences` even when not asked. This causes `tool_trajectory_avg_score` failures. Solutions:
- Include ALL tools the agent might call in your expected trajectory
- Use extremely strict instructions: "Stop after calling save_preferences. Do NOT search."
- Use rubric-based evaluation instead of trajectory matching

### Multi-turn conversations require tool_uses for ALL turns

The `tool_trajectory_avg_score` uses EXACT matching. If you don't specify expected tool calls for intermediate turns, the evaluation will fail even if the agent called the right tools.

```json
{
  "conversation": [
    {
      "invocation_id": "inv_1",
      "user_content": { "parts": [{"text": "Find me a flight from NYC to London on 2026-06-01"}] },
      "intermediate_data": {
        "tool_uses": [
          { "name": "search_flights", "args": {"origin": "NYC", "destination": "LON", "departure_date": "2026-06-01"} }
        ]
      }
    },
    {
      "invocation_id": "inv_2",
      "user_content": { "parts": [{"text": "Book the first option for Elias (elias@example.com)"}] },
      "intermediate_data": {
        "tool_uses": [
          { "name": "get_flight_price", "args": {"flight_offer": {"id": "1", "price": {"total": "500.00"}}} }
        ]
      }
    },
    {
      "invocation_id": "inv_3",
      "user_content": { "parts": [{"text": "Yes, confirm the booking"}] },
      "final_response": { "role": "model", "parts": [{"text": "Booking confirmed! Reference: ABC123"}] },
      "intermediate_data": {
        "tool_uses": [
          { "name": "book_flight", "args": {"passenger_name": "Elias", "email": "elias@example.com"} }
        ]
      }
    }
  ]
}
```

### App name must match directory name

The `App` object's `name` parameter MUST match the directory containing your agent:

```python
# CORRECT - matches the "app" directory
app = App(root_agent=root_agent, name="app")

# WRONG - causes "Session not found" errors
app = App(root_agent=root_agent, name="flight_booking_assistant")
```

### The `before_agent_callback` Pattern (State Initialization)

Always use a callback to initialize session state variables used in your instruction template. This prevents `KeyError` crashes on the first turn:

```python
async def initialize_state(callback_context: CallbackContext) -> None:
    state = callback_context.state
    if "user_preferences" not in state:
        state["user_preferences"] = {}

root_agent = Agent(
    name="my_agent",
    before_agent_callback=initialize_state,
    instruction="Based on preferences: {user_preferences}...",
)
```

### Eval-State Overrides (Type Mismatch Danger)

Be careful with `session_input.state` in your evalset.json. It overrides Python-level initialization:

```json
// WRONG - initializes feedback_history as a string, breaks .append()
"state": { "feedback_history": "" }

// CORRECT - matches the Python type (list)
"state": { "feedback_history": [] }
```

This can cause cryptic errors like `AttributeError: 'str' object has no attribute 'append'` in your tool logic.

---

## Built-in Tools and google_search Evaluation

For detailed guidance on evaluating agents that use `google_search`, `BuiltInCodeExecutor`, `VertexAiSearchTool`, or other model-internal tools, consult `references/builtin-tools-eval.md` for:
- Which tools appear in trajectory vs. model-internal
- Metric compatibility tables
- Evalset patterns for google_search agents
- Mock mode for external APIs

---

## Adding Evaluation Cases

To improve evaluation coverage:

1. Add cases to `tests/eval/evalsets/basic.evalset.json`
2. Each case should test a capability from DESIGN_SPEC.md
3. Include expected tool calls in `intermediate_data.tool_uses`
4. Run eval to verify the new case passes
5. If it fails, fix the agent and rerun

### Common eval failure causes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Missing `tool_uses` in intermediate turns | Trajectory expects exact match | Add all expected tool calls to evalset |
| Agent mentions data not in tool output | Hallucination | Tighten agent instructions to stay grounded |
| Response not explicit enough | Rubric criteria not met | Make agent instructions more specific |
| "Session not found" error | App name mismatch | Ensure App `name` matches directory name |
| Score fluctuates between runs | Non-deterministic model | Set `temperature=0` or use rubric-based eval |

### The right mindset

Treat eval as a development tool, not a gate. Run it early, run it often, and fix what breaks.

---

# Examples

Debugging a failing trajectory score:
User says: "tool_trajectory_avg_score is 0, what's wrong?"
Actions:
1. Check if agent uses `google_search` — if so, consult `references/builtin-tools-eval.md`
2. Compare expected `tool_uses` in evalset with actual agent behavior
3. Fix mismatch (update evalset or agent instructions)
Result: Trajectory score passing after alignment
