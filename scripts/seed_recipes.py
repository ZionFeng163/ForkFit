"""Seed database with realistic Chinese recipes and food images from Unsplash."""

import os
from forkfit.db.session import make_session_factory
from forkfit.db.models import Base, PostRow
from uuid import uuid4

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql+psycopg://forkfit:forkfit@postgres:5432/forkfit")
session_factory = make_session_factory(DATABASE_URL)

RECIPES = [
    {
        "title": "番茄炒蛋的完美做法",
        "theme": "家常菜",
        "location": "上海",
        "image_urls": ["https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=900&q=85"],
        "description": "每个人都做过的家常菜，但 90% 的人不知道正确顺序。蛋要先炒到七分熟盛出，番茄出汁后再回锅，口感嫩滑、汁水浓郁。",
        "recipe": {
            "id": "r_tomato_egg", "day": "post", "name": "番茄炒蛋",
            "ingredients": ["鸡蛋 3个", "番茄 2个", "葱花 适量", "盐 适量", "糖 少许"],
            "equipment": ["炒锅"], "cook_time_minutes": 15, "estimated_cost": 8,
            "tags": ["家常菜", "快手菜", "下饭"], "difficulty": "easy",
            "notes": "番茄要选熟透的，蛋不要炒太老。先炒蛋盛出，再炒番茄出汁后回锅。",
            "steps": ["番茄切十字刀，开水烫30秒去皮，切小块", "鸡蛋打散加少许盐，热锅冷油炒到七分熟盛出", "锅中少许油，下番茄中火翻炒至出汁", "加一勺番茄酱增色，加少许糖提鲜", "倒回鸡蛋翻炒均匀，出锅撒葱花"]
        },
    },
    {
        "title": "宫保鸡丁",
        "theme": "川菜",
        "location": "成都",
        "image_urls": ["https://images.unsplash.com/photo-1525755662778-989d0524087e?auto=format&fit=crop&w=900&q=85"],
        "description": "经典川菜，鸡丁嫩滑、花生酥脆、辣而不燥，配米饭绝佳。关键在于鸡丁要腌制入味，花生要后放保持酥脆。",
        "recipe": {
            "id": "r_kung_pao", "day": "post", "name": "宫保鸡丁",
            "ingredients": ["鸡胸肉 300g", "花生米 50g", "干辣椒 8个", "花椒 1勺", "葱姜蒜 适量", "酱油 2勺", "醋 1勺", "糖 1勺", "淀粉 1勺"],
            "equipment": ["炒锅"], "cook_time_minutes": 25, "estimated_cost": 18,
            "tags": ["川菜", "下饭", "家常菜"], "difficulty": "medium",
            "notes": "鸡丁要腌制15分钟，花生最后放保持酥脆。糖醋比例1:1。",
            "steps": ["鸡胸肉切丁，加酱油、淀粉腌制15分钟", "花生米小火炒至微黄盛出", "热锅冷油，下花椒干辣椒爆香", "下鸡丁大火翻炒至变色", "加葱姜蒜、酱油、醋、糖调味", "最后加入花生米翻炒均匀出锅"]
        },
    },
    {
        "title": "蒜蓉西兰花",
        "theme": "快手菜",
        "location": "北京",
        "image_urls": ["https://images.unsplash.com/photo-1459411552884-841db9b3cc2a?auto=format&fit=crop&w=900&q=85"],
        "description": "清脆爽口的蒜蓉西兰花，低卡高蛋白，健身党必备。焯水时间是关键，30秒即可保持脆嫩。",
        "recipe": {
            "id": "r_broccoli", "day": "post", "name": "蒜蓉西兰花",
            "ingredients": ["西兰花 1颗", "蒜 5瓣", "盐 适量", "蚝油 1勺"],
            "equipment": ["炒锅"], "cook_time_minutes": 10, "estimated_cost": 6,
            "tags": ["快手菜", "减脂", "素菜"], "difficulty": "easy",
            "notes": "西兰花焯水不要超过30秒，蒜要后放避免炒焦。",
            "steps": ["西兰花切小朵，淡盐水浸泡10分钟", "烧开水，加少许油和盐，焯水30秒捞出", "热锅冷油，下蒜末爆香", "倒入西兰花大火翻炒，加蚝油调味", "翻炒均匀即可出锅"]
        },
    },
    {
        "title": "酸辣土豆丝",
        "theme": "家常菜",
        "location": "西安",
        "image_urls": ["https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=85"],
        "description": "酸辣爽脆的土豆丝，切丝是关键。刀工不好可以用擦丝器，但手切的口感更好。",
        "recipe": {
            "id": "r_potato", "day": "post", "name": "酸辣土豆丝",
            "ingredients": ["土豆 2个", "干辣椒 5个", "花椒 少许", "醋 2勺", "盐 适量", "葱花 适量"],
            "equipment": ["炒锅"], "cook_time_minutes": 15, "estimated_cost": 5,
            "tags": ["家常菜", "下饭", "素菜"], "difficulty": "easy",
            "notes": "土豆丝切好后泡水去淀粉，炒之前沥干。醋要沿锅边淋入。",
            "steps": ["土豆去皮切细丝，泡入清水中去除淀粉", "干辣椒切段，葱切葱花", "热锅冷油，下花椒干辣椒爆香", "沥干土豆丝下锅大火翻炒", "沿锅边淋入醋，加盐调味", "翻炒均匀撒葱花出锅"]
        },
    },
    {
        "title": "可乐鸡翅",
        "theme": "家常菜",
        "location": "广州",
        "image_urls": ["https://images.unsplash.com/photo-1527477396000-e27163b481c2?auto=format&fit=crop&w=900&q=85"],
        "description": "甜香四溢的可乐鸡翅，色泽红亮，新手零失败。可乐代替糖和酱油，一罐搞定。",
        "recipe": {
            "id": "r_cola_wings", "day": "post", "name": "可乐鸡翅",
            "ingredients": ["鸡翅中 10个", "可乐 1罐", "酱油 3勺", "姜片 3片", "料酒 1勺"],
            "equipment": ["炒锅"], "cook_time_minutes": 30, "estimated_cost": 15,
            "tags": ["家常菜", "新手", "下饭"], "difficulty": "easy",
            "notes": "鸡翅要先焯水去腥，可乐用普通可乐不要用无糖的。",
            "steps": ["鸡翅两面划刀，冷水下锅焯水去腥捞出", "锅中少许油，放入鸡翅煎至两面金黄", "加姜片、料酒、酱油翻炒上色", "倒入可乐没过鸡翅，大火烧开转中小火", "煮15分钟后大火收汁至浓稠即可"]
        },
    },
    {
        "title": "手抓饼配煎蛋",
        "theme": "早餐",
        "location": "杭州",
        "image_urls": ["https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=900&q=85"],
        "description": "五分钟搞定的完美早餐，外酥里嫩的手抓饼加上溏心蛋，配一杯豆浆绝了。",
        "recipe": {
            "id": "r_pancake_egg", "day": "post", "name": "手抓饼配煎蛋",
            "ingredients": ["手抓饼 1张", "鸡蛋 1个", "生菜 2片", "甜面酱 适量"],
            "equipment": ["平底锅"], "cook_time_minutes": 5, "estimated_cost": 4,
            "tags": ["早餐", "快手菜", "面食"], "difficulty": "easy",
            "notes": "手抓饼不用放油，直接干煎。鸡蛋煎到溏心最好吃。",
            "steps": ["平底锅不放油，放入手抓饼中小火煎", "翻面煎至两面金黄", "打入鸡蛋，撒少许盐", "鸡蛋半熟时放上生菜，抹甜面酱", "卷起切半即可"]
        },
    },
    {
        "title": "红烧排骨",
        "theme": "硬菜",
        "location": "南京",
        "image_urls": ["https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=900&q=85"],
        "description": "软烂入味的红烧排骨，收汁浓郁，入口即化。关键是先炒糖色再炖煮。",
        "recipe": {
            "id": "r_ribs", "day": "post", "name": "红烧排骨",
            "ingredients": ["排骨 500g", "冰糖 30g", "酱油 3勺", "料酒 2勺", "姜片 3片", "八角 2个", "桂皮 1小块"],
            "equipment": ["炒锅", "砂锅"], "cook_time_minutes": 60, "estimated_cost": 35,
            "tags": ["硬菜", "家常菜", "下饭"], "difficulty": "medium",
            "notes": "排骨要冷水下锅焯水。炒糖色时小火慢炒，颜色变深立即下排骨。",
            "steps": ["排骨剁小块，冷水下锅焯水去血沫捞出", "锅中放冰糖小火炒至焦糖色", "迅速下排骨翻炒裹上糖色", "加料酒、酱油、姜片、八角、桂皮", "加热水没过排骨，大火烧开转小火炖40分钟", "大火收汁至浓稠即可"]
        },
    },
    {
        "title": "紫菜蛋花汤",
        "theme": "汤羹",
        "location": "福州",
        "image_urls": ["https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=900&q=85"],
        "description": "清淡鲜美的紫菜蛋花汤，三分钟就能上桌。蛋液要沿锅边缓缓倒入，形成漂亮的蛋花。",
        "recipe": {
            "id": "r_seaweed_soup", "day": "post", "name": "紫菜蛋花汤",
            "ingredients": ["紫菜 10g", "鸡蛋 2个", "盐 适量", "香油 少许", "葱花 适量"],
            "equipment": ["汤锅"], "cook_time_minutes": 8, "estimated_cost": 4,
            "tags": ["汤羹", "快手菜", "养生"], "difficulty": "easy",
            "notes": "蛋液要打散，沿锅边缓缓倒入形成蛋花。紫菜最后放保持口感。",
            "steps": ["紫菜撕成小片，鸡蛋打散备用", "锅中烧开水，加盐调味", "将蛋液沿锅边缓缓倒入，形成蛋花", "放入紫菜，淋几滴香油", "撒葱花即可出锅"]
        },
    },
    {
        "title": "麻婆豆腐",
        "theme": "川菜",
        "location": "成都",
        "image_urls": ["https://images.unsplash.com/photo-1582452919408-aca2fdcd0b4f?auto=format&fit=crop&w=900&q=85"],
        "description": "麻辣鲜香的麻婆豆腐，豆腐嫩滑入味，下饭神器。正宗做法要用郫县豆瓣酱。",
        "recipe": {
            "id": "r_mapo", "day": "post", "name": "麻婆豆腐",
            "ingredients": ["嫩豆腐 1块", "猪肉末 100g", "郫县豆瓣酱 1勺", "花椒粉 适量", "葱花 适量", "蒜末 适量"],
            "equipment": ["炒锅"], "cook_time_minutes": 15, "estimated_cost": 10,
            "tags": ["川菜", "下饭", "家常菜"], "difficulty": "medium",
            "notes": "豆腐先焯水定型，郫县豆瓣酱要小火炒出红油。",
            "steps": ["豆腐切小块，淡盐水焯2分钟捞出", "热锅冷油，下肉末炒散", "加郫县豆瓣酱小火炒出红油", "加蒜末、适量水烧开", "放入豆腐轻轻推动，煮3分钟入味", "勾薄芡，撒花椒粉和葱花出锅"]
        },
    },
    {
        "title": "蛋炒饭",
        "theme": "快手菜",
        "location": "扬州",
        "image_urls": ["https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=900&q=85"],
        "description": "粒粒分明的黄金蛋炒饭，蛋液要先裹住米饭再炒，这样每粒米都是金黄色。",
        "recipe": {
            "id": "r_fried_rice", "day": "post", "name": "蛋炒饭",
            "ingredients": ["隔夜米饭 1碗", "鸡蛋 2个", "葱花 适量", "盐 适量", "酱油 少许"],
            "equipment": ["炒锅"], "cook_time_minutes": 10, "estimated_cost": 5,
            "tags": ["快手菜", "早餐", "主食"], "difficulty": "easy",
            "notes": "一定要用隔夜米饭，新鲜米饭太黏。蛋液先拌入米饭再炒。",
            "steps": ["鸡蛋打散，倒入米饭中拌匀", "热锅多油，倒入蛋液米饭", "大火快速翻炒，让每粒米都裹上蛋液", "加盐和少许酱油调味", "撒葱花翻炒均匀出锅"]
        },
    },
    {
        "title": "清蒸鲈鱼",
        "theme": "粤菜",
        "location": "广州",
        "image_urls": ["https://images.unsplash.com/photo-1534766555764-ce878a0fbbf7?auto=format&fit=crop&w=900&q=85"],
        "description": "鲜嫩爽滑的清蒸鲈鱼，关键在于蒸的时间不能太长，8分钟刚好。",
        "recipe": {
            "id": "r_steam_fish", "day": "post", "name": "清蒸鲈鱼",
            "ingredients": ["鲈鱼 1条", "葱丝 适量", "姜丝 适量", "蒸鱼豉油 3勺", "热油 适量"],
            "equipment": ["蒸锅"], "cook_time_minutes": 15, "estimated_cost": 25,
            "tags": ["粤菜", "清淡", "高蛋白"], "difficulty": "medium",
            "notes": "鱼要新鲜，蒸之前在鱼身划几刀。蒸好后先倒掉盘中积水再淋豉油。",
            "steps": ["鲈鱼清洗干净，两面划几刀", "鱼身铺上姜丝，肚子里也塞几片", "水烧开后放入蒸锅，大火蒸8分钟", "取出倒掉盘中积水，铺上葱丝", "淋上蒸鱼豉油，浇热油激出香味"]
        },
    },
    {
        "title": "抹茶巴斯克蛋糕",
        "theme": "甜品",
        "location": "上海",
        "image_urls": ["https://images.unsplash.com/photo-1565958011703-44f9829ba187?auto=format&fit=crop&w=900&q=85"],
        "description": "外焦里嫩的巴斯克蛋糕加上抹茶的清香，零失败的新手友好甜品。",
        "recipe": {
            "id": "r_basque", "day": "post", "name": "抹茶巴斯克蛋糕",
            "ingredients": ["奶油芝士 250g", "淡奶油 200ml", "鸡蛋 3个", "糖 80g", "抹茶粉 15g", "低筋面粉 15g"],
            "equipment": ["烤箱"], "cook_time_minutes": 50, "estimated_cost": 30,
            "tags": ["甜品", "烘焙", "下午茶"], "difficulty": "medium",
            "notes": "奶油芝士要室温软化。烤箱预热220°C，烤25分钟后转180°C再烤15分钟。",
            "steps": ["奶油芝士室温软化，加糖搅拌顺滑", "分次加入鸡蛋，每次搅拌均匀", "加入淡奶油和过筛的抹茶粉、低筋面粉拌匀", "倒入铺了油纸的6寸模具", "220°C烤25分钟，转180°C烤15分钟", "出炉放凉后冷藏4小时以上"]
        },
    },
    {
        "title": "鸡胸肉藜麦沙拉",
        "theme": "减脂餐",
        "location": "深圳",
        "image_urls": ["https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=85"],
        "description": "高蛋白低脂的完美减脂餐，饱腹感强，健身党的理想选择。",
        "recipe": {
            "id": "r_salad", "day": "post", "name": "鸡胸肉藜麦沙拉",
            "ingredients": ["鸡胸肉 150g", "藜麦 50g", "混合生菜 100g", "小番茄 6个", "牛油果 半个", "橄榄油 1勺", "柠檬汁 1勺"],
            "equipment": ["平底锅"], "cook_time_minutes": 20, "estimated_cost": 18,
            "tags": ["减脂", "高蛋白", "便当"], "difficulty": "easy",
            "notes": "鸡胸肉用黑胡椒和盐腌制后煎熟。藜麦提前煮好放凉。",
            "steps": ["藜麦洗净煮熟，沥水放凉", "鸡胸肉撒黑胡椒和盐，平底锅煎至两面金黄", "混合生菜铺底，摆上藜麦、鸡胸肉切片", "放上对半切的小番茄和牛油果", "淋橄榄油和柠檬汁，撒少许盐即可"]
        },
    },
    {
        "title": "韭菜盒子",
        "theme": "面食",
        "location": "天津",
        "image_urls": ["https://images.unsplash.com/photo-1496116218417-1a781b6c42f1?auto=format&fit=crop&w=900&q=85"],
        "description": "外酥里嫩的韭菜盒子，韭菜鸡蛋虾皮的经典搭配，早餐绝佳选择。",
        "recipe": {
            "id": "r_chive_box", "day": "post", "name": "韭菜盒子",
            "ingredients": ["韭菜 200g", "鸡蛋 3个", "虾皮 适量", "面粉 200g", "盐 适量", "香油 少许"],
            "equipment": ["平底锅"], "cook_time_minutes": 30, "estimated_cost": 12,
            "tags": ["面食", "早餐", "家常菜"], "difficulty": "medium",
            "notes": "韭菜洗净后一定要沥干水分，否则馅料会出水。面皮要擀薄。",
            "steps": ["面粉加温水揉成光滑面团，醒20分钟", "韭菜切碎，加盐杀水后沥干", "鸡蛋炒碎，加虾皮和韭菜拌匀", "面团擀成薄皮，包入馅料捏紧", "平底锅少油，中小火煎至两面金黄"]
        },
    },
    {
        "title": "糖醋里脊",
        "theme": "家常菜",
        "location": "北京",
        "image_urls": ["https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?auto=format&fit=crop&w=900&q=85"],
        "description": "外酥里嫩的糖醋里脊，酸甜可口，大人小孩都爱吃。挂糊要薄，炸两遍更酥脆。",
        "recipe": {
            "id": "r_sweet_sour", "day": "post", "name": "糖醋里脊",
            "ingredients": ["猪里脊 300g", "鸡蛋 1个", "淀粉 3勺", "番茄酱 3勺", "醋 2勺", "糖 2勺", "盐 少许"],
            "equipment": ["炒锅"], "cook_time_minutes": 25, "estimated_cost": 20,
            "tags": ["家常菜", "下饭", "硬菜"], "difficulty": "medium",
            "notes": "里脊切条后腌制10分钟。油温180°C炸第一遍，200°C复炸第二遍更酥。",
            "steps": ["里脊切条，加盐、料酒、蛋液腌制10分钟", "裹上淀粉，油温180°C炸至金黄捞出", "升高油温至200°C，复炸30秒更酥脆", "锅留底油，加番茄酱、醋、糖、少许水煮开", "倒入炸好的里脊快速翻炒均匀出锅"]
        },
    },
]

def seed():
    session = session_factory()
    try:
        for recipe in RECIPES:
            # Check if already exists
            existing = session.query(PostRow).filter(PostRow.title == recipe["title"]).first()
            if existing:
                print(f"  Skip (exists): {recipe['title']}")
                continue

            post_id = f"post_{uuid4().hex[:12]}"
            post = PostRow(
                id=post_id,
                user_id="usr_rae001",  # Assign to Rae Liu
                author="Rae Liu",
                title=recipe["title"],
                theme=recipe["theme"],
                location=recipe["location"],
                image_urls=recipe["image_urls"],
                description=recipe["description"],
                recipe_payload=recipe["recipe"],
                saves=0,
                likes=0,
                forks=0,
            )
            session.add(post)
            session.commit()
            print(f"  Created: {recipe['title']}")
    finally:
        session.close()
    print(f"\nDone! Seeded {len(RECIPES)} recipes.")

if __name__ == "__main__":
    seed()
