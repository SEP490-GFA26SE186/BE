from pathlib import Path

from app.errors import AiError


class LocalStorage:
    """Backend du phong khi chua co credential Cloudinary.

    Ton tai de `docker compose up` chay duoc NGAY, truoc khi ai kip dien key
    Cloudinary — dev moi clone repo khong bi chan o buoc cau hinh. Ghi vao thu muc
    tam trong container; key tra ve giong het backend that nen phia Node khong
    phan biet duoc hai truong hop.
    """

    def __init__(self, root: str = "/tmp/storyweaver-storage") -> None:
        self._root = Path(root)

    @property
    def backend(self) -> str:
        return "local"

    def _path(self, key: str) -> Path:
        # Defence in depth: request models already reject '..', but never trust one layer.
        root = self._root.resolve()
        target = (root / key).resolve()
        if not target.is_relative_to(root):
            raise AiError.invalid_input("Key nằm ngoài thư mục lưu trữ.")
        return target

    async def upload(self, key: str, data: bytes, content_type: str) -> str:
        target = self._path(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        return key

    async def download(self, key: str) -> bytes:
        target = self._path(key)
        if not target.is_file():
            raise AiError.invalid_input("Không tìm thấy file theo key đã cho.")
        return target.read_bytes()
