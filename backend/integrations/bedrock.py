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


def _lmstudio_llm():
    """
    LM Studio exposes an OpenAI-compatible API at localhost:1234.
    Install: https://lmstudio.ai  → load any model → start local server.
    
    Uses crewai.LLM with 'openai/' prefix so LiteLLM routes it correctly.
    """
    from crewai import LLM
    return LLM(
        model=f"openai/{settings.LM_STUDIO_MODEL}",   # LiteLLM needs provider prefix
        base_url=settings.LM_STUDIO_BASE_URL,
        api_key="lm-studio",                           # LM Studio ignores this value
        temperature=0.1,
        max_tokens=512,                                # keep responses short to preserve context budget
    )


def _bedrock_llm():
    """
    AWS Bedrock — Claude 3 Sonnet.
    Requires: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY in env (or IAM role).
    """
    import boto3
    from langchain_aws import ChatBedrock
    client = boto3.client("bedrock-runtime", region_name=settings.BEDROCK_REGION)
    return ChatBedrock(
        client=client,
        model_id=settings.BEDROCK_MODEL_ID,
        model_kwargs={"max_tokens": 1024, "temperature": 0.1},
    )
