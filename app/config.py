import os
from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    openai_api_key: str = ""
    openai_chat_model: str = "gpt-4o"  # override with OPENAI_CHAT_MODEL
    openai_embedding_model: str = "text-embedding-3-small"  # override with OPENAI_EMBEDDING_MODEL
    data_dir: str = os.path.abspath(os.path.join(os.getcwd(), "data"))
    chroma_dir: str = os.path.abspath(os.path.join(data_dir, "chroma"))


settings = Settings()

# Ensure required dirs exist early
os.makedirs(settings.data_dir, exist_ok=True)
os.makedirs(settings.chroma_dir, exist_ok=True)



