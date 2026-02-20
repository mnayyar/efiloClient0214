"""Cloudflare R2 file storage service via boto3."""

import boto3
from botocore.config import Config

from app.config import get_settings

_settings = get_settings()

# Lazy-initialized S3 client (compatible with R2)
_s3_client = None


def _get_client():
    """Get or create the boto3 S3 client for R2."""
    global _s3_client
    if _s3_client is None:
        if not _settings.r2_account_id or not _settings.r2_access_key_id:
            raise RuntimeError("R2 credentials not configured")
        _s3_client = boto3.client(
            "s3",
            endpoint_url=f"https://{_settings.r2_account_id}.r2.cloudflarestorage.com",
            aws_access_key_id=_settings.r2_access_key_id,
            aws_secret_access_key=_settings.r2_secret_access_key,
            region_name="auto",
            config=Config(signature_version="s3v4"),
        )
    return _s3_client


def build_r2_key(project_id: str, document_id: str, filename: str) -> str:
    """Build the standardized R2 key: {projectId}/{documentId}/{filename}."""
    return f"{project_id}/{document_id}/{filename}"


def get_presigned_upload_url(
    key: str, content_type: str, expires_in: int = 3600
) -> str:
    """Generate a presigned PUT URL for client-side upload."""
    client = _get_client()
    return client.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": _settings.r2_bucket_name,
            "Key": key,
            "ContentType": content_type,
        },
        ExpiresIn=expires_in,
    )


def get_presigned_download_url(key: str, expires_in: int = 3600) -> str:
    """Generate a presigned GET URL for downloading a file."""
    client = _get_client()
    return client.generate_presigned_url(
        "get_object",
        Params={
            "Bucket": _settings.r2_bucket_name,
            "Key": key,
        },
        ExpiresIn=expires_in,
    )


def download_from_r2(key: str) -> bytes:
    """Download a file from R2 and return its contents as bytes."""
    client = _get_client()
    response = client.get_object(Bucket=_settings.r2_bucket_name, Key=key)
    return response["Body"].read()


def upload_to_r2(key: str, body: bytes, content_type: str) -> None:
    """Upload file bytes directly to R2."""
    client = _get_client()
    client.put_object(
        Bucket=_settings.r2_bucket_name,
        Key=key,
        Body=body,
        ContentType=content_type,
    )


def delete_from_r2(key: str) -> None:
    """Delete a file from R2."""
    client = _get_client()
    client.delete_object(Bucket=_settings.r2_bucket_name, Key=key)
