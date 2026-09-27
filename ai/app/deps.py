from typing import Annotated

from fastapi import Depends, Header

from app.config import Settings, get_settings
from app.errors import AiError

SettingsDep = Annotated[Settings, Depends(get_settings)]


async def verify_internal_token(
    settings: SettingsDep,
    x_internal_token: Annotated[str | None, Header()] = None,
) -> None:
    """Chi Node trong network noi bo duoc goi service nay.

    Khong dung JWT cua user: ai/ khong biet gi ve user. Trong
    docker-compose, container `ai` dung `expose` chu khong `ports`, nen day la
    lop thu hai chu khong phai lop duy nhat.

    That bai tra ve INVALID_INPUT (khong retryable) thay vi mot loai loi tam
    thoi: token sai thi thu lai 3 lan van sai, va do la loi cau hinh.
    """
    if not x_internal_token or x_internal_token != settings.internal_token:
        raise AiError.invalid_input("X-Internal-Token thieu hoac khong dung")


InternalAuth = Depends(verify_internal_token)
