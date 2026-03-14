"""
Dual LLM backend:
  - LM Studio  → local testing (OpenAI-compatible endpoint at localhost:1234)
  - AWS Bedrock → hackathon hosted run (Claude 3 Sonnet)

Switch via LLM_PROVIDER in .env:
  LLM_PROVIDER=lmstudio   (default, works offline)
  LLM_PROVIDER=bedrock    (requires AWS creds in env)

CrewAI agents receive an `llm` object — both routes return something CrewAI accepts.

IMPORTANT: qwen3-8b has a <think> mode that consumes 500+ tokens BEFORE answering.
           Disabled via extra_body to preserve token budget for JSON output.
"""

from backend.config import settings


def get_llm():
    """Return a CrewAI-compatible LLM object (uses crewai.LLM / LiteLLM under the hood)."""
    if settings.LLM_PROVIDER == "bedrock":
        return _bedrock_llm()
    return _lmstudio_llm()


def _lmstudio_llm():
    """
    LM Studio exposes an OpenAI-compatible API at localhost:1234.
    
    Uses crewai.LLM with 'openai/' prefix so LiteLLM routes it correctly.
    Disables thinking mode via chat_template_kwargs to prevent <think> tags
    from consuming the entire token budget.
    """
    from crewai import LLM
    return LLM(
        model=f"openai/{settings.LM_STUDIO_MODEL}",
        base_url=settings.LM_STUDIO_BASE_URL,
        api_key="lm-studio",
        temperature=0.1,
        max_tokens=1024,
        extra_body={
            "chat_template_kwargs": {"enable_thinking": False},
        },
    )


def _bedrock_llm():
    """
    AWS Bedrock — Claude via LiteLLM (crewai.LLM).
    Uses temporary STS credentials loaded from .env.
    Requires: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN in env.
    """
    import os
    from crewai import LLM

    # Ensure boto3/LiteLLM picks up temporary credentials from settings
    os.environ["AWS_ACCESS_KEY_ID"] = settings.AWS_ACCESS_KEY_ID
    os.environ["AWS_SECRET_ACCESS_KEY"] = settings.AWS_SECRET_ACCESS_KEY
    os.environ["AWS_SESSION_TOKEN"] = settings.AWS_SESSION_TOKEN
    os.environ["AWS_DEFAULT_REGION"] = settings.BEDROCK_REGION

    return LLM(
        model=f"bedrock/{settings.BEDROCK_MODEL_ID}",
        temperature=0.1,
        max_tokens=1024,
    )
