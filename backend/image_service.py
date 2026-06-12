"""
Image generation abstraction layer.

Public coroutine:
    generate_image(prompt, aspect_ratio) → local file path

Provider:
    All provider-specific logic lives in _call_provider().
    Swap Kie.ai for any other API by changing only that function.

Retry:
    Up to _MAX_RETRIES attempts with exponential backoff (1 s, 2 s, 4 s).
"""

import asyncio
import logging
import os
import uuid
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

_MAX_RETRIES = 3
_BACKOFF_BASE = 1  # seconds; delay = _BACKOFF_BASE * 2 ** attempt
_TEMP_DIR = Path("outputs") / "temp"

_ASPECT_RATIO_MAP = {
    "1:1":  "1:1",
    "16:9": "16:9",
}


# ---------------------------------------------------------------------------
# Provider layer  (swap this function to change the image API)
# ---------------------------------------------------------------------------

async def _call_provider(prompt: str, aspect_ratio: str, client: httpx.AsyncClient) -> bytes:
    """
    Call the image generation provider and return raw image bytes.

    Current provider: Kie.ai
    API key:          KIE_API_KEY in .env
    Endpoint:         https://kieai.ergoapi.com/v1/images/generations (placeholder)

    To swap providers, replace this function body only.
    The rest of image_service.py is provider-agnostic.
    """
    api_key = os.environ.get("KIE_API_KEY")
    if not api_key:
        raise RuntimeError("KIE_API_KEY is not set")

    payload = {
        "prompt": prompt,
        "aspect_ratio": _ASPECT_RATIO_MAP.get(aspect_ratio, aspect_ratio),
        "response_format": "b64_json",
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    # NOTE: Confirm the exact Kie.ai endpoint and response schema before
    # activating this in Phase 5. The URL and field names below are placeholders.
    response = await client.post(
        "https://kieai.ergoapi.com/v1/images/generations",
        json=payload,
        headers=headers,
        timeout=60.0,
    )
    response.raise_for_status()

    data = response.json()

    # Expected response shape: {"data": [{"b64_json": "<base64>"}]}
    import base64
    b64 = data["data"][0]["b64_json"]
    return base64.b64decode(b64)


# ---------------------------------------------------------------------------
# Public coroutine
# ---------------------------------------------------------------------------

async def generate_image(prompt: str, aspect_ratio: str) -> str:
    """
    Generate an image from a prompt and save it locally.

    Args:
        prompt:       Plain-text image generation prompt (from llm_service).
        aspect_ratio: "1:1" or "16:9".

    Returns:
        Absolute path to the saved PNG file under outputs/temp/.

    Raises:
        Exception: After all retries are exhausted, with a descriptive message.
    """
    _TEMP_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}.png"
    output_path = _TEMP_DIR / filename

    last_error: Exception | None = None

    async with httpx.AsyncClient() as client:
        for attempt in range(_MAX_RETRIES):
            try:
                logger.info(
                    "Image generation attempt %d/%d | aspect_ratio=%s",
                    attempt + 1, _MAX_RETRIES, aspect_ratio,
                )
                image_bytes = await _call_provider(prompt, aspect_ratio, client)
                output_path.write_bytes(image_bytes)
                logger.info("Image saved → %s", output_path)
                return str(output_path)

            except httpx.HTTPStatusError as exc:
                last_error = exc
                logger.warning(
                    "HTTP %d on attempt %d: %s",
                    exc.response.status_code, attempt + 1, exc.response.text[:200],
                )
            except httpx.RequestError as exc:
                last_error = exc
                logger.warning("Request error on attempt %d: %s", attempt + 1, exc)
            except Exception as exc:
                last_error = exc
                logger.warning("Unexpected error on attempt %d: %s", attempt + 1, exc)

            if attempt < _MAX_RETRIES - 1:
                delay = _BACKOFF_BASE * (2 ** attempt)
                logger.info("Retrying in %ds …", delay)
                await asyncio.sleep(delay)

    raise Exception(
        f"Image generation failed after {_MAX_RETRIES} attempt(s). "
        f"Last error: {last_error}"
    )
