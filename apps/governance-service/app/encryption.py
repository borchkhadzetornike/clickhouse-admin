"""AES-128-GCM encryption for ClickHouse passwords stored in Postgres."""

import os
import base64

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .config import ENCRYPTION_KEY


def _get_key() -> bytes:
    return bytes.fromhex(ENCRYPTION_KEY)


def encrypt(plaintext: str) -> str:
    key = _get_key()
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    ct = aesgcm.encrypt(nonce, plaintext.encode(), None)
    return base64.b64encode(nonce + ct).decode()


def decrypt(ciphertext: str) -> str:
    key = _get_key()
    aesgcm = AESGCM(key)
    data = base64.b64decode(ciphertext)
    nonce = data[:12]
    ct = data[12:]
    return aesgcm.decrypt(nonce, ct, None).decode()
