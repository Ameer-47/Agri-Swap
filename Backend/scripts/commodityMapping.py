commodity_mapping = {
    "Apple": ["Apple"],
    "Banana": ["Banana", "Banana - Green"],
    "Beetroot": ["Beetroot"],
    "Bell Pepper": ["Capsicum"],
    "Cabbage": ["Cabbage"],
    "Carrot": ["Carrot"],
    "Cauliflower": ["Cauliflower"],
    "Chilli Pepper": ["Green Chilli"],
    "Corn": ["Maize"],
    "Cucumber": [],
    "Eggplant": ["Brinjal"],
    "Garlic": ["Garlic"],
    "Ginger": ["Ginger (Green)"],
    "Grapes": ["Grapes"],
    "Jalapeno": [],
    "Kiwi": [],
    "Lemon": ["Lemon"],
    "Lettuce": [],
    "Mango": ["Mango"],
    "Onion": ["Onion"],
    "Orange": ["Orange"],
    "Paprika": [],
    "Pear": ["Pear (Marasebu)"],
    "Peas": ["Green Peas", "Peas Wet"],
    "Pineapple": ["Pineapple"],
    "Pomegranate": ["Pomegranate"],
    "Potato": ["Potato"],
    "Radish": [],
    "Soy Beans": ["Soyabean"],
    "Spinach": ["Spinach"],
    "Sweetcorn": ["Maize"],
    "Sweetpotato": ["Sweet Potato"],
    "Tomato": ["Tomato"],
    "Turnip": ["Turnip"],
    "Watermelon": []
}

print("Total image classes:", len(commodity_mapping))

for image_class, market_names in commodity_mapping.items():
    print(image_class, "->", market_names)