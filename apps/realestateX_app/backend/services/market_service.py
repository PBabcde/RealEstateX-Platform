from modules.realestateX.marketX import MarketX
from modules.realestateX.realestate_storageX import RealEstateStorageX

storage = RealEstateStorageX()
module = MarketX()


def trends() -> dict:
    result = module.trends()
    storage.save_market(result)
    return result
