import os
from dotenv import load_dotenv

# Load .env file
load_dotenv()

class Settings:
    # Pine Labs
    PINE_CLIENT_ID: str = os.getenv("PINE_CLIENT_ID", "")
    PINE_CLIENT_SECRET: str = os.getenv("PINE_CLIENT_SECRET", "")
    PINE_MERCHANT_ID: str = os.getenv("PINE_MERCHANT_ID", "")
    PINE_ENV: str = os.getenv("PINE_ENV", "UAT")
    PINE_CALLBACK_URL: str = os.getenv("PINE_CALLBACK_URL", "http://localhost:8000/webhooks/pine")
    PINE_FAILURE_CALLBACK_URL: str = os.getenv("PINE_FAILURE_CALLBACK_URL", "http://localhost:8000/webhooks/pine/failure")

    # LLM — dual route: LM Studio (local dev) OR AWS Bedrock (hackathon hosting)
    LLM_PROVIDER: str = "lmstudio"        # "lmstudio" | "bedrock"
    LM_STUDIO_BASE_URL: str = "http://localhost:1234/v1"
    LM_STUDIO_MODEL: str = "qwen3-8b"  # qwen/qwen3-8b in LM Studio — supports tool calling + thinking
    BEDROCK_REGION: str = "us-east-1"
    BEDROCK_MODEL_ID: str = "us.anthropic.claude-opus-4-6-v1"

    # AWS credentials (used by boto3/LiteLLM for Bedrock)
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_SESSION_TOKEN: str = ""
    AWS_DEFAULT_REGION: str = "us-east-1"

    # App
    SECRET_KEY: str = os.getenv("SECRET_KEY", "changeme-for-prod")
    DEBUG: bool = os.getenv("DEBUG", "true").lower() == "true"

settings = Settings()
