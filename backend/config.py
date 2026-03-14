from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Pine Labs
    PINE_CLIENT_ID: str = "your_client_id_here"
    PINE_CLIENT_SECRET: str = "your_client_secret_here"
    PINE_MERCHANT_ID: str = "your_merchant_id_here"
    PINE_ENV: str = "UAT"   # UAT | PRODUCTION
    PINE_CALLBACK_URL: str = "http://localhost:8000/webhooks/pine"
    PINE_FAILURE_CALLBACK_URL: str = "http://localhost:8000/webhooks/pine/failure"

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
    SECRET_KEY: str = "changeme-for-prod"
    DEBUG: bool = True
    ALLOWED_ORIGINS: str = ""   # Comma-separated extra origins e.g. https://xxx.vercel.app

    class Config:
        env_file = ".env"

settings = Settings()
