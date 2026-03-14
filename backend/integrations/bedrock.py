"""
Dual LLM backend:
  - LM Studio  → local testing (OpenAI-compatible endpoint at localhost:1234)
  - AWS Bedrock → hackathon hosted run (Claude 3 Sonnet)

Switch via LLM_PROVIDER in .env:
  LLM_PROVIDER=lmstudio   (default, works offline)
  LLM_PROVIDER=bedrock    (requires AWS creds in env)

CrewAI agents receive an `llm` object — both routes return something CrewAI accepts.
"""

from backend.config import settings


def get_llm():
    """Return a CrewAI-compatible LLM object (uses crewai.LLM / LiteLLM under the hood)."""
    if settings.LLM_PROVIDER == "bedrock":
        return _bedrock_llm()
    return _lmstudio_llm()


def get_thinking_llm():
    """
    Return LLM with reduced max_tokens for thinking/analysis phases.
    Helps avoid context overflow when agents do extensive reasoning.
    Use this for intermediate reasoning steps, keep get_llm() for final outputs.
    """
    if settings.LLM_PROVIDER == "bedrock":
        return _bedrock_llm(max_tokens=512)
    return _lmstudio_llm(max_tokens=512)


def _lmstudio_llm(max_tokens=1024):
    """
    LM Studio exposes an OpenAI-compatible API at localhost:1234.
    Install: https://lmstudio.ai  → load any model → start local server.
    
    Uses crewai.LLM with 'openai/' prefix so LiteLLM routes it correctly.
    Args:
      max_tokens: 1024 for full output, 512 for thinking phases
    """
    from crewai import LLM
    return LLM(
        model=f"openai/{settings.LM_STUDIO_MODEL}",   # LiteLLM needs provider prefix
        base_url=settings.LM_STUDIO_BASE_URL,
        api_key="lm-studio",                           # LM Studio ignores this value
        temperature=0.1,
        max_tokens=2048,  # thinking block alone can be 500+ tokens; need headroom for JSON answer
    )


def _bedrock_llm(max_tokens=1024):
    """
    AWS Bedrock — Claude 3 Sonnet.
    Requires: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY in env (or IAM role).
    Args:
      max_tokens: 1024 for full output, 512 for thinking phases
    """
    import boto3
    from langchain_aws import ChatBedrock
    client = boto3.client("bedrock-runtime", region_name=settings.BEDROCK_REGION)
    return ChatBedrock(
        client=client,
        model_id=settings.BEDROCK_MODEL_ID,
        model_kwargs={"max_tokens": max_tokens, "temperature": 0.1},
    )
