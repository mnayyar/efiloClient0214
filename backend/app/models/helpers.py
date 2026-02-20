"""Shared model helpers."""

from cuid2 import Cuid

_cuid_generator = Cuid()


def generate_cuid() -> str:
    """Generate a CUID2 ID matching Prisma's @default(cuid())."""
    return _cuid_generator.generate()
