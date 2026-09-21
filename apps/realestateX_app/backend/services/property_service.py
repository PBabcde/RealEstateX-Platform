from typing import Any, Dict

from modules.realestateX.propertyX import PropertyX
from modules.realestateX.realestate_storageX import RealEstateStorageX

storage = RealEstateStorageX()
module = PropertyX()


def list_properties() -> Dict[str, Any]:
    return storage.load_properties()


def add_property(property_id: str, data: Dict[str, Any]) -> dict:
    properties = storage.load_properties()
    result = module.add_property(property_id, data)
    properties[property_id] = data
    storage.save_properties(properties)
    return result
