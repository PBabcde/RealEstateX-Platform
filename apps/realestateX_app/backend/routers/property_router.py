from typing import Any, Dict

from fastapi import APIRouter

from apps.realestateX_app.backend.services.property_service import (
    add_property,
    list_properties,
)

router = APIRouter(prefix="/propertyX", tags=["PropertyX"])


@router.get("/")
def list_all() -> Dict[str, Any]:
    return list_properties()


@router.post("/add")
def add(property_id: str, data: Dict[str, Any]) -> dict:
    return add_property(property_id, data)
