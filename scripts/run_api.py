from __future__ import annotations

import os
import uvicorn


if __name__ == "__main__":
    host = os.getenv("API_HOST", "0.0.0.0")
    uvicorn.run("forkfit.api.app:app", host=host, port=8000, reload=False)
