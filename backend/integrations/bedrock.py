"""
Dual LLM backend:
  - LM Studio  → local testing (OpenAI-compatible endpoint at localhost:1234)
  - AWS Bedrock → hackathon hosted run (Claude Opus 4.6)

Switch via LLM_PROVIDER in .env:
  LLM_PROVIDER=lmstudio   (default, works offline)
  LLM_PROVIDER=bedrock    (requires BEDROCK_API_KEY in env)

CrewAI agents receive an `llm` object — both routes return something CrewAI accepts.

IMPORTANT: qwen3-8b has a <think> mode that consumes 500+ tokens BEFORE answering.
           Disabled via extra_body to preserve token budget for JSON output.
"""

import os
import boto3
import logging
from botocore.exceptions import ClientError
from backend.config import settings

logger = logging.getLogger(__name__)

# Global boto3 client for Bedrock
_bedrock_client = None


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


def _get_bedrock_client():
    """Get or create boto3 Bedrock client with bearer token authentication."""
    global _bedrock_client
    
    if _bedrock_client is not None:
        return _bedrock_client
    
    brt = boto3.client(
        "bedrock-runtime",
        region_name=settings.BEDROCK_REGION,
        aws_access_key_id="",      # Leave empty when using bearer token
        aws_secret_access_key="",  # Leave empty when using bearer token
    )
    
    # Register bearer token in request headers
    def add_bearer_token(event_name, **kwargs):
        if 'params' in kwargs:
            if 'headers' not in kwargs['params']:
                kwargs['params']['headers'] = {}
            kwargs['params']['headers']['Authorization'] = f'Bearer {settings.BEDROCK_API_KEY}'
    
    brt.meta.events.register('before-call', add_bearer_token)
    _bedrock_client = brt
    return brt


def _bedrock_llm():
    """
    AWS Bedrock — Claude Opus 4.6 using boto3 with bearer token authentication.
    Returns a CrewAI LLM object using Bedrock provider.
    """
    from crewai import LLM
    
    logger.info(f"🔐 Bedrock Configuration:")
    logger.info(f"   BEDROCK_REGION: {settings.BEDROCK_REGION}")
    logger.info(f"   BEDROCK_MODEL_ID: {settings.BEDROCK_MODEL_ID}")
    logger.info(f"   API Key Present: {bool(settings.BEDROCK_API_KEY)}")
    
    # Format model ID for LiteLLM: bedrock/<model-id>
    # This tells LiteLLM to use Bedrock provider
    bedrock_model = f"bedrock/{settings.BEDROCK_MODEL_ID}"
    
    # Return CreawAI LLM object for Bedrock
    # LiteLLM will route to Bedrock handler based on "bedrock/" prefix
    return LLM(
        model=bedrock_model,  # e.g., "bedrock/us.anthropic.claude-opus-4-6-v1"
        temperature=0.1,
        max_tokens=1024,
    )

