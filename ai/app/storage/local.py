from pathlib import Path


class LocalStorage:
    """Backend du phong khi chua co credential Supabase.

    Ton tai de `docker compose up` chay duoc NGAY, truoc khi ai kip dien key
    Supabase — dev moi clone repo khong bi chan o buoc cau hinh. Ghi vao thu muc
    tam trong container; key tra ve giong het backend that nen phia Node khong
    phan biet duoc hai truong hop.
    """

    def __init__(self, root: str = "/tmp/storyweaver-storage") -> None:
        self._root = Path(root)

    @property
    def backend(self) -> str:
        return "local"

    async def upload(self, key: str, data: bytes, content_type: str) -> str:
        target = self._root / key
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        return key
