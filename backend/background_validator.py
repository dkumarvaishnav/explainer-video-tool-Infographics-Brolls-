"""
Background colour validation for generated images.

Placeholder in V1 — always passes. Full implementation will detect the
dominant colour in the image and compare it against the expected hex value.
"""


def validate_background(image_path: str, expected_hex: str) -> bool:
    """
    Return True if the image background matches the expected solid colour.

    Args:
        image_path:   Path to the generated PNG file.
        expected_hex: Expected background colour as a hex string (e.g. "#1A2B3C").

    TODO (V1 full implementation):
        - Open the image with Pillow
        - Sample corner/edge pixels to detect dominant background colour
        - Convert sampled colour to hex and compare with expected_hex
        - Return False if the difference exceeds a tolerance threshold
        - Return False if a gradient is detected (high colour variance along edges)
    """
    return True
