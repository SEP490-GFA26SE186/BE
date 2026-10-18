import asyncio
import socket

import pytest

from tests.conftest import NetworkBlockedError


def test_connect_to_public_ip_is_blocked():
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        with pytest.raises(NetworkBlockedError, match="1.1.1.1"):
            sock.connect(("1.1.1.1", 443))
    finally:
        sock.close()


def test_getaddrinfo_public_host_is_blocked():
    with pytest.raises(NetworkBlockedError, match="example.com"):
        socket.getaddrinfo("example.com", 443)


def test_getaddrinfo_localhost_allowed():
    assert socket.getaddrinfo("localhost", 0)


def test_socketpair_works():
    a, b = socket.socketpair()
    a.close()
    b.close()


def test_new_event_loop_runs_coroutine():
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(asyncio.sleep(0))
    finally:
        loop.close()


async def test_async_test_runs():
    await asyncio.sleep(0)
