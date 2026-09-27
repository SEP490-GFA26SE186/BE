import httpx

from app.errors import AiError


class SupabaseStorage:
    """Upload len Supabase Storage qua REST API.

    Dung REST truc tiep thay vi SDK supabase-py: service nay CHI duoc phep
    dung Storage, keo ca SDK vao la keo theo auth/postgrest/realtime — dung
    nhung thu ma bien kien truc da cam no cham vao.
    """

    def __init__(self, url: str, service_key: str, bucket: str) -> None:
        self._base = f"{url.rstrip('/')}/storage/v1/object"
        self._key = service_key
        self._bucket = bucket

    @property
    def backend(self) -> str:
        return "supabase"

    async def upload(self, key: str, data: bytes, content_type: str) -> str:
        """Ghi `data` vao `key` trong bucket, tra ve chinh `key`."""
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.post(
                    f"{self._base}/{self._bucket}/{key}",
                    content=data,
                    headers={
                        "Authorization": f"Bearer {self._key}",
                        "Content-Type": content_type,
                        # Ghi de neu job bi retry — tranh loi "Duplicate" lam
                        # mot job dang le thanh cong lai that bai.
                        "x-upsert": "true",
                    },
                )
        except httpx.HTTPError as error:
            raise AiError.provider_error(f"Khong upload duoc len Supabase: {error}") from error

        if response.status_code >= 400:
            raise AiError.provider_error(
                f"Supabase Storage tra ve {response.status_code}: {response.text[:200]}"
            )
        return key
