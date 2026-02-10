"""AES-128-GCM encryption — shared logic with governance-service."""

import os
import base64

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .config import ENCRYPTION_KEY


def _get_key() -> bytes:
    return bytes.fromhex(ENCRYPTION_KEY)


def decrypt(ciphertext: str) -> str:
    key = _get_key()
    aesgcm = AESGCM(key)
    data = base64.b64decode(ciphertext)
    nonce = data[:12]
    ct = data[12:]
    return aesgcm.decrypt(nonce, ct, None).decode()
