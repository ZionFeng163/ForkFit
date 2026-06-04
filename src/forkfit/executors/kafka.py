from __future__ import annotations

from forkfit.config import get_settings
from forkfit.kafka_utils import produce
from forkfit.models import MealPack, UserProfile
from forkfit.serialization import meal_pack_to_dict, user_profile_to_dict

TOPIC = "forkfit-jobs"


class KafkaJobExecutor:
    async def submit(
        self,
        *,
        run_id: str,
        user_profile: UserProfile,
        meal_pack: MealPack,
        locale: str = "en",
    ) -> None:
        settings = get_settings()
        message = {
            "run_id": run_id,
            "user_profile": user_profile_to_dict(user_profile),
            "meal_pack": meal_pack_to_dict(meal_pack),
            "locale": locale,
        }
        produce(TOPIC, message, key=run_id, bootstrap_servers=settings.kafka_bootstrap_servers)
