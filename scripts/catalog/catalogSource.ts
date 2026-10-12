/*
 * Curated source for Pinch's built-in catalog. Nutrition is per 100 g, transcribed from USDA FoodData
 * Central reference values (SR Legacy, raw or as bought unless the name says otherwise). Rows:
 *   slug | name | family | emoji codepoint | kcal | protein | carbs | fat | serving | g per ml | g each | aliases
 * Serving is "<amount> <UNIT>", a dash means unknown. `npm run catalog:build` expands this into src/apps/pinch/catalog.
 */
export const CATALOG_FAMILY_ROWS = `
chicken|Chicken
beef|Beef
pork|Pork
turkey|Turkey
lamb|Lamb
fish|Fish
shellfish|Shellfish
eggs|Eggs
milk|Milk
cheese|Cheese
yogurt|Yogurt & cream
butter|Butter & ghee
rice|Rice
grains|Grains
pasta|Pasta & noodles
flour|Flour
baking|Baking
sugar|Sugar & sweeteners
oil|Oils
vinegar|Vinegar
beans|Beans & lentils
soy|Tofu & soy
onion|Onions & garlic
pepper|Peppers
tomato|Tomatoes
potato|Potatoes
vegetables|Vegetables
greens|Leafy greens
fruit|Fruit
citrus|Citrus
berries|Berries
nuts|Nuts & nut butters
seeds|Seeds
bread|Bread & tortillas
spices|Spices
herbs|Fresh herbs
sauces|Sauces & condiments
broth|Broth & stock
pickles|Pickles & olives
snacks|Snacks & sweets
drinks|Drinks
`;

export const CATALOG_INGREDIENT_ROWS = `
chicken-breast|Chicken breast|chicken|1f357|165|31|0|3.6|4 OZ|-|174|boneless skinless chicken breast
chicken-thigh|Chicken thigh|chicken|1f357|209|26|0|10.9|4 OZ|-|116|boneless chicken thighs
chicken-drumstick|Chicken drumstick|chicken|1f357|172|28.3|0|5.7|1 EACH|-|70|drumsticks
chicken-wings|Chicken wings|chicken|1f357|203|30.5|0|8.1|4 OZ|-|34|wings
ground-chicken|Ground chicken|chicken|1f357|143|17.4|0|8.1|4 OZ|-|-|minced chicken
whole-chicken|Whole chicken|chicken|1f357|215|18.6|0|15.1|4 OZ|-|-|roasting chicken
ground-beef-80|Ground beef 80/20|beef|1f969|254|17.2|0|20|4 OZ|-|-|minced beef,hamburger meat
ground-beef-90|Ground beef 90/10|beef|1f969|176|20|0|10|4 OZ|-|-|lean ground beef
beef-sirloin|Sirloin steak|beef|1f969|183|20.6|0|10.8|4 OZ|-|-|top sirloin
beef-ribeye|Ribeye steak|beef|1f969|291|18.7|0|23.9|4 OZ|-|-|rib eye
beef-chuck|Chuck roast|beef|1f969|220|19|0|15|4 OZ|-|-|beef stew meat,pot roast
pork-chop|Pork chop|pork|1f356|143|21.4|0|5.7|4 OZ|-|-|pork loin,loin chop
pork-shoulder|Pork shoulder|pork|1f356|236|16.3|0|18|4 OZ|-|-|pork butt,boston butt
ground-pork|Ground pork|pork|1f356|263|16.9|0|21.2|4 OZ|-|-|minced pork
bacon|Bacon|pork|1f953|417|12.6|1.4|41.8|2 OZ|-|8|streaky bacon
ham|Ham|pork|1f356|145|21|1.5|5.5|2 OZ|-|-|deli ham
pork-sausage|Pork sausage|pork|1f356|339|13.7|1.4|31.3|3 OZ|-|-|breakfast sausage,italian sausage
hot-dogs|Hot dogs|pork|1f32d|290|10.3|4.2|26.2|1 EACH|-|45|frankfurters
ground-turkey|Ground turkey|turkey|1f983|148|19.9|0|7.7|4 OZ|-|-|minced turkey
turkey-breast|Turkey breast|turkey|1f983|114|23.7|0|1.5|4 OZ|-|-|turkey cutlets
ground-lamb|Ground lamb|lamb|1f356|282|16.6|0|23.4|4 OZ|-|-|minced lamb
salmon|Salmon|fish|1f41f|208|20.4|0|13.4|4 OZ|-|-|salmon fillet
tuna-steak|Tuna steak|fish|1f41f|109|24.4|0|0.5|4 OZ|-|-|fresh tuna,ahi
canned-tuna|Canned tuna|fish|1f41f|116|25.5|0|0.8|3 OZ|-|-|tuna in water
cod|Cod|fish|1f41f|82|17.8|0|0.7|4 OZ|-|-|cod fillet
tilapia|Tilapia|fish|1f41f|96|20.1|0|1.7|4 OZ|-|-|tilapia fillet
sardines|Sardines|fish|1f41f|208|24.6|0|11.5|3 OZ|-|-|canned sardines
shrimp|Shrimp|shellfish|1f990|85|20.1|0.2|0.5|4 OZ|-|-|prawns
crab-meat|Crab meat|shellfish|1f980|87|18.1|0|1.1|3 OZ|-|-|crab
scallops|Scallops|shellfish|1f990|88|16.8|2.4|0.8|4 OZ|-|-|sea scallops
egg|Egg|eggs|1f95a|143|12.6|0.7|9.5|1 EACH|-|50|eggs,whole egg
egg-white|Egg white|eggs|1f95a|52|10.9|0.7|0.2|1 EACH|-|33|egg whites
egg-yolk|Egg yolk|eggs|1f95a|322|15.9|3.6|26.5|1 EACH|-|17|egg yolks
whole-milk|Whole milk|milk|1f95b|61|3.2|4.8|3.3|1 CUP|1.03|-|milk
two-percent-milk|2% milk|milk|1f95b|50|3.3|4.8|2|1 CUP|1.03|-|reduced fat milk
skim-milk|Skim milk|milk|1f95b|34|3.4|5|0.1|1 CUP|1.03|-|nonfat milk,fat free milk
half-and-half|Half and half|milk|1f95b|131|3.1|4.3|11.5|1 TBSP|1.01|-|half & half
heavy-cream|Heavy cream|milk|1f95b|340|2.8|2.8|36.1|1 TBSP|0.99|-|whipping cream,double cream
buttermilk|Buttermilk|milk|1f95b|40|3.3|4.8|0.9|1 CUP|1.03|-|
evaporated-milk|Evaporated milk|milk|1f95b|134|6.8|10|7.6|1 TBSP|1.07|-|
almond-milk|Almond milk|milk|1f95b|15|0.6|0.3|1.2|1 CUP|1|-|unsweetened almond milk
oat-milk|Oat milk|milk|1f95b|48|1|6.7|1.5|1 CUP|1.03|-|
soy-milk|Soy milk|milk|1f95b|33|2.9|1.7|1.6|1 CUP|1.03|-|
coconut-milk|Coconut milk|milk|1f965|197|2|2.8|21.3|0.25 CUP|0.97|-|canned coconut milk
cheddar|Cheddar cheese|cheese|1f9c0|403|24.9|1.3|33.1|1 OZ|-|-|cheddar,sharp cheddar
mozzarella|Mozzarella|cheese|1f9c0|280|27.5|3.1|17.1|1 OZ|-|-|mozzarella cheese
parmesan|Parmesan|cheese|1f9c0|431|38.5|4.1|28.6|1 TBSP|0.4|-|parmigiano reggiano,grated parmesan
feta|Feta|cheese|1f9c0|264|14.2|4.1|21.3|1 OZ|-|-|feta cheese
cream-cheese|Cream cheese|cheese|1f9c0|342|6|5.5|34.2|1 OZ|-|-|
swiss-cheese|Swiss cheese|cheese|1f9c0|380|26.9|5.4|27.8|1 OZ|-|-|
goat-cheese|Goat cheese|cheese|1f9c0|364|21.6|0.1|29.8|1 OZ|-|-|chevre
ricotta|Ricotta|cheese|1f9c0|174|11.3|3|13|0.25 CUP|1.03|-|ricotta cheese
cottage-cheese|Cottage cheese|cheese|1f9c0|98|11.1|3.4|4.3|0.5 CUP|1.02|-|
blue-cheese|Blue cheese|cheese|1f9c0|353|21.4|2.3|28.7|1 OZ|-|-|gorgonzola
provolone|Provolone|cheese|1f9c0|351|25.6|2.1|26.6|1 OZ|-|-|
plain-yogurt|Plain yogurt|yogurt|1f95b|61|3.5|4.7|3.3|0.75 CUP|1.03|-|yoghurt
greek-yogurt|Greek yogurt|yogurt|1f95b|59|10.2|3.6|0.4|0.75 CUP|1.05|-|nonfat greek yogurt
sour-cream|Sour cream|yogurt|1f95b|198|2.4|4.6|19.4|2 TBSP|1.01|-|
butter|Butter|butter|1f9c8|717|0.9|0.1|81.1|1 TBSP|0.96|-|unsalted butter,salted butter
ghee|Ghee|butter|1f9c8|876|0.3|0|99.5|1 TBSP|0.91|-|clarified butter
white-rice|White rice|rice|1f35a|365|7.1|80|0.7|0.25 CUP|0.78|-|long grain rice
jasmine-rice|Jasmine rice|rice|1f35a|365|7.1|80|0.7|0.25 CUP|0.78|-|
basmati-rice|Basmati rice|rice|1f35a|351|8.4|78|0.6|0.25 CUP|0.78|-|
brown-rice|Brown rice|rice|1f35a|370|7.9|77.2|2.9|0.25 CUP|0.8|-|
wild-rice|Wild rice|rice|1f35a|357|14.7|74.9|1.1|0.25 CUP|0.7|-|
arborio-rice|Arborio rice|rice|1f35a|358|6.7|79.8|0.6|0.25 CUP|0.8|-|risotto rice
sushi-rice|Sushi rice|rice|1f35a|358|6.7|79.8|0.6|0.25 CUP|0.8|-|short grain rice
rolled-oats|Rolled oats|grains|1f963|379|13.2|67.7|6.5|0.5 CUP|0.38|-|oatmeal,old fashioned oats
quinoa|Quinoa|grains|1f33e|368|14.1|64.2|6.1|0.25 CUP|0.72|-|
couscous|Couscous|grains|1f33e|376|12.8|77.4|0.6|0.25 CUP|0.73|-|
bulgur|Bulgur|grains|1f33e|342|12.3|75.9|1.3|0.25 CUP|0.66|-|bulgur wheat
pearl-barley|Pearl barley|grains|1f33e|352|9.9|77.7|1.2|0.25 CUP|0.8|-|barley
cornmeal|Cornmeal|grains|1f33d|362|8.1|76.9|3.9|0.25 CUP|0.58|-|polenta,grits
spaghetti|Spaghetti|pasta|1f35d|371|13|74.7|1.5|2 OZ|0.4|-|dry spaghetti
penne|Penne|pasta|1f35d|371|13|74.7|1.5|2 OZ|0.4|-|
macaroni|Macaroni|pasta|1f35d|371|13|74.7|1.5|2 OZ|0.44|-|elbow macaroni
fettuccine|Fettuccine|pasta|1f35d|371|13|74.7|1.5|2 OZ|0.4|-|
lasagna-noodles|Lasagna noodles|pasta|1f35d|371|13|74.7|1.5|2 OZ|-|-|lasagne sheets
egg-noodles|Egg noodles|pasta|1f35c|384|14.2|71.3|4.4|2 OZ|0.3|-|
rice-noodles|Rice noodles|pasta|1f35c|364|3.4|83.2|0.6|2 OZ|-|-|pad thai noodles
ramen-noodles|Ramen noodles|pasta|1f35c|436|9.7|61.5|17|1 EACH|-|85|instant ramen
all-purpose-flour|All-purpose flour|flour|1f33e|364|10.3|76.3|1|0.25 CUP|0.53|-|plain flour,ap flour
bread-flour|Bread flour|flour|1f33e|361|12.9|72.5|1.7|0.25 CUP|0.53|-|
whole-wheat-flour|Whole wheat flour|flour|1f33e|340|13.2|72|2.5|0.25 CUP|0.51|-|wholemeal flour
almond-flour|Almond flour|flour|1f330|579|21.2|21.4|49.9|0.25 CUP|0.4|-|almond meal
cornstarch|Cornstarch|baking|1f33d|381|0.3|91.3|0.1|1 TBSP|0.54|-|corn flour
baking-powder|Baking powder|baking|-|53|0|27.7|0|1 TSP|0.93|-|
baking-soda|Baking soda|baking|-|0|0|0|0|1 TSP|1.1|-|bicarbonate of soda
yeast|Active dry yeast|baking|-|325|40.4|41.2|7.6|1 TSP|0.6|-|
cocoa-powder|Cocoa powder|baking|1f36b|228|19.6|57.9|13.7|1 TBSP|0.36|-|unsweetened cocoa
chocolate-chips|Chocolate chips|baking|1f36b|479|4.2|63.9|30|0.25 CUP|0.7|-|semi-sweet chocolate
vanilla-extract|Vanilla extract|baking|-|288|0.1|12.7|0.1|1 TSP|0.88|-|vanilla
breadcrumbs|Breadcrumbs|baking|1f35e|395|13.4|72|5.3|0.25 CUP|0.43|-|panko
white-sugar|White sugar|sugar|-|387|0|100|0|1 TSP|0.85|-|granulated sugar,sugar
brown-sugar|Brown sugar|sugar|-|380|0.1|98.1|0|1 TSP|0.93|-|
powdered-sugar|Powdered sugar|sugar|-|389|0|99.8|0.1|1 TBSP|0.51|-|icing sugar,confectioners sugar
honey|Honey|sugar|1f36f|304|0.3|82.4|0|1 TBSP|1.43|-|
maple-syrup|Maple syrup|sugar|1f341|260|0|67|0.1|1 TBSP|1.33|-|
molasses|Molasses|sugar|-|290|0|74.7|0.1|1 TBSP|1.4|-|treacle
agave-syrup|Agave syrup|sugar|-|310|0.1|76.4|0.5|1 TBSP|1.36|-|agave nectar
corn-syrup|Corn syrup|sugar|-|281|0|76.8|0.2|1 TBSP|1.38|-|
olive-oil|Olive oil|oil|1fad2|884|0|0|100|1 TBSP|0.92|-|extra virgin olive oil,evoo
vegetable-oil|Vegetable oil|oil|-|884|0|0|100|1 TBSP|0.92|-|cooking oil
canola-oil|Canola oil|oil|-|884|0|0|100|1 TBSP|0.92|-|rapeseed oil
coconut-oil|Coconut oil|oil|1f965|862|0|0|100|1 TBSP|0.92|-|
sesame-oil|Sesame oil|oil|-|884|0|0|100|1 TSP|0.92|-|toasted sesame oil
shortening|Shortening|oil|-|884|0|0|100|1 TBSP|0.87|-|crisco
white-vinegar|White vinegar|vinegar|-|18|0|0|0|1 TBSP|1.01|-|distilled vinegar
apple-cider-vinegar|Apple cider vinegar|vinegar|1f34e|21|0|0.9|0|1 TBSP|1.01|-|cider vinegar
balsamic-vinegar|Balsamic vinegar|vinegar|-|88|0.5|17|0|1 TBSP|1.05|-|
rice-vinegar|Rice vinegar|vinegar|-|18|0|0.4|0|1 TBSP|1.01|-|
red-wine-vinegar|Red wine vinegar|vinegar|-|19|0|0.3|0|1 TBSP|1.01|-|
black-beans|Black beans|beans|1fad8|341|21.6|62.4|1.4|0.25 CUP|0.75|-|dried black beans
pinto-beans|Pinto beans|beans|1fad8|347|21.4|62.6|1.2|0.25 CUP|0.75|-|dried pinto beans
kidney-beans|Kidney beans|beans|1fad8|333|23.6|60|0.8|0.25 CUP|0.75|-|dried kidney beans
chickpeas|Chickpeas|beans|1fad8|378|20.5|63|6|0.25 CUP|0.75|-|garbanzo beans,dried chickpeas
white-beans|White beans|beans|1fad8|333|23.4|60.3|0.9|0.25 CUP|0.75|-|cannellini beans,navy beans
canned-black-beans|Canned black beans|beans|1fad8|91|6|16.6|0.3|0.5 CUP|1|-|black beans can
canned-chickpeas|Canned chickpeas|beans|1fad8|139|7|22.5|2.6|0.5 CUP|1|-|canned garbanzo beans
canned-kidney-beans|Canned kidney beans|beans|1fad8|84|5.2|15|0.5|0.5 CUP|1|-|
lentils|Lentils|beans|1fad8|352|24.6|63.4|1.1|0.25 CUP|0.8|-|brown lentils,green lentils
red-lentils|Red lentils|beans|1fad8|358|23.9|63.1|2.2|0.25 CUP|0.8|-|split red lentils
split-peas|Split peas|beans|1fad8|341|24.6|60.4|1.2|0.25 CUP|0.8|-|
green-peas|Green peas|beans|1f7e2|81|5.4|14.5|0.4|0.5 CUP|0.65|-|frozen peas
tofu|Tofu|soy|-|76|8.1|1.9|4.8|3 OZ|-|-|firm tofu,bean curd
tempeh|Tempeh|soy|-|192|20.3|7.6|10.8|3 OZ|-|-|
edamame|Edamame|soy|1fad8|121|11.9|8.9|5.2|0.5 CUP|0.65|-|soybeans
yellow-onion|Yellow onion|onion|1f9c5|40|1.1|9.3|0.1|0.5 EACH|0.65|110|onion,brown onion
red-onion|Red onion|onion|1f9c5|40|0.9|9.3|0.1|0.5 EACH|0.65|110|purple onion
white-onion|White onion|onion|1f9c5|40|1.1|9.3|0.1|0.5 EACH|0.65|110|
green-onion|Green onion|onion|1f9c5|32|1.8|7.3|0.2|1 EACH|-|15|scallion,spring onion
shallot|Shallot|onion|1f9c5|72|2.5|16.8|0.1|1 EACH|-|40|
leek|Leek|onion|1f9c5|61|1.5|14.2|0.3|0.5 EACH|-|89|
garlic|Garlic|onion|1f9c4|149|6.4|33.1|0.5|1 EACH|-|3|garlic clove,fresh garlic
bell-pepper-red|Red bell pepper|pepper|1fad1|31|1|6|0.3|0.5 EACH|0.55|119|capsicum
bell-pepper-green|Green bell pepper|pepper|1fad1|20|0.9|4.6|0.2|0.5 EACH|0.55|119|green capsicum
bell-pepper-yellow|Yellow bell pepper|pepper|1fad1|27|1|6.3|0.2|0.5 EACH|0.55|119|yellow capsicum
jalapeno|Jalapeño|pepper|1f336|29|0.9|6.5|0.4|1 EACH|-|14|jalapeno pepper
poblano|Poblano pepper|pepper|1f336|20|0.9|4.6|0.2|1 EACH|-|100|
habanero|Habanero pepper|pepper|1f336|40|2|9|0.4|1 EACH|-|10|
tomato|Tomato|tomato|1f345|18|0.9|3.9|0.2|1 EACH|1|123|fresh tomato,roma tomato
cherry-tomatoes|Cherry tomatoes|tomato|1f345|18|0.9|3.9|0.2|5 EACH|1|17|grape tomatoes
canned-diced-tomatoes|Canned diced tomatoes|tomato|1f96b|21|1|4.3|0.2|0.5 CUP|1|-|diced tomatoes
crushed-tomatoes|Crushed tomatoes|tomato|1f96b|32|1.6|7.3|0.3|0.25 CUP|1.03|-|
tomato-sauce|Tomato sauce|tomato|1f96b|24|1.2|5.3|0.3|0.25 CUP|1.03|-|
tomato-paste|Tomato paste|tomato|1f96b|82|4.3|18.9|0.5|1 TBSP|1.08|-|
marinara-sauce|Marinara sauce|tomato|1f96b|50|1.4|7.5|1.5|0.5 CUP|1.03|-|pasta sauce,spaghetti sauce
sun-dried-tomatoes|Sun-dried tomatoes|tomato|1f345|258|14.1|55.8|3|1 TBSP|0.5|-|
russet-potato|Russet potato|potato|1f954|79|2.1|18.1|0.1|1 EACH|-|213|baking potato,idaho potato
red-potato|Red potato|potato|1f954|70|1.9|15.9|0.1|1 EACH|-|170|
yukon-gold-potato|Yukon gold potato|potato|1f954|77|2|17.5|0.1|1 EACH|-|170|gold potato
sweet-potato|Sweet potato|potato|1f360|86|1.6|20.1|0.1|1 EACH|-|130|yam
carrot|Carrot|vegetables|1f955|41|0.9|9.6|0.2|1 EACH|0.55|61|carrots
celery|Celery|vegetables|1f96c|16|0.7|3|0.2|1 EACH|0.6|40|celery stalk
broccoli|Broccoli|vegetables|1f966|34|2.8|6.6|0.4|1 CUP|0.35|-|broccoli florets
cauliflower|Cauliflower|vegetables|1f966|25|1.9|5|0.3|1 CUP|0.45|-|
zucchini|Zucchini|vegetables|1f952|17|1.2|3.1|0.3|0.5 EACH|0.6|196|courgette
cucumber|Cucumber|vegetables|1f952|15|0.7|3.6|0.1|0.5 EACH|0.6|300|
corn|Corn|vegetables|1f33d|86|3.3|18.7|1.4|1 EACH|0.65|90|corn on the cob,sweet corn
green-beans|Green beans|vegetables|1f96c|31|1.8|7|0.2|1 CUP|0.45|-|string beans
asparagus|Asparagus|vegetables|1f96c|20|2.2|3.9|0.1|5 EACH|-|16|
mushrooms|Mushrooms|vegetables|1f344|22|3.1|3.3|0.3|1 CUP|0.3|18|white mushrooms,button mushrooms
eggplant|Eggplant|vegetables|1f346|25|1|5.9|0.2|1 CUP|0.25|458|aubergine
cabbage|Cabbage|vegetables|1f96c|25|1.3|5.8|0.1|1 CUP|0.3|-|green cabbage
brussels-sprouts|Brussels sprouts|vegetables|1f966|43|3.4|9|0.3|1 CUP|0.45|-|
butternut-squash|Butternut squash|vegetables|1f383|45|1|11.7|0.1|1 CUP|0.6|-|
pumpkin-puree|Pumpkin puree|vegetables|1f383|34|1.1|8.1|0.3|0.5 CUP|1|-|canned pumpkin
beets|Beets|vegetables|-|43|1.6|9.6|0.2|1 EACH|-|82|beetroot
radish|Radish|vegetables|-|16|0.7|3.4|0.1|3 EACH|-|9|
spinach|Spinach|greens|1f96c|23|2.9|3.6|0.4|1 CUP|0.1|-|baby spinach
kale|Kale|greens|1f96c|35|2.9|4.4|1.5|1 CUP|0.1|-|
romaine-lettuce|Romaine lettuce|greens|1f96c|17|1.2|3.3|0.3|1 CUP|0.1|-|romaine
iceberg-lettuce|Iceberg lettuce|greens|1f96c|14|0.9|3|0.1|1 CUP|0.1|-|
arugula|Arugula|greens|1f96c|25|2.6|3.7|0.7|1 CUP|0.07|-|rocket
bok-choy|Bok choy|greens|1f96c|13|1.5|2.2|0.2|1 CUP|0.15|-|pak choi
swiss-chard|Swiss chard|greens|1f96c|19|1.8|3.7|0.2|1 CUP|0.1|-|chard
avocado|Avocado|fruit|1f951|160|2|8.5|14.7|0.5 EACH|0.9|150|
apple|Apple|fruit|1f34e|52|0.3|13.8|0.2|1 EACH|0.6|182|apples
banana|Banana|fruit|1f34c|89|1.1|22.8|0.3|1 EACH|0.9|118|bananas
grapes|Grapes|fruit|1f347|69|0.7|18.1|0.2|1 CUP|0.65|-|
pear|Pear|fruit|1f350|57|0.4|15.2|0.1|1 EACH|-|178|
peach|Peach|fruit|1f351|39|0.9|9.5|0.3|1 EACH|-|150|
pineapple|Pineapple|fruit|1f34d|50|0.5|13.1|0.1|1 CUP|0.8|-|
mango|Mango|fruit|1f96d|60|0.8|15|0.4|1 CUP|0.8|336|
watermelon|Watermelon|fruit|1f349|30|0.6|7.6|0.2|1 CUP|0.7|-|
kiwi|Kiwi|fruit|1f95d|61|1.1|14.7|0.5|1 EACH|-|69|kiwifruit
cherries|Cherries|fruit|1f352|63|1.1|16|0.2|1 CUP|0.6|-|
plum|Plum|fruit|-|46|0.7|11.4|0.3|1 EACH|-|66|
raisins|Raisins|fruit|-|299|3.1|79.2|0.5|0.25 CUP|0.6|-|
dates|Dates|fruit|-|277|1.8|75|0.2|2 EACH|-|24|medjool dates
dried-cranberries|Dried cranberries|fruit|-|308|0.1|82.8|1.4|0.25 CUP|0.5|-|craisins
shredded-coconut|Shredded coconut|fruit|1f965|660|6.9|23.7|64.5|0.25 CUP|0.35|-|desiccated coconut
orange|Orange|citrus|1f34a|47|0.9|11.8|0.1|1 EACH|-|131|oranges
lemon|Lemon|citrus|1f34b|29|1.1|9.3|0.3|1 EACH|-|58|lemons
lime|Lime|citrus|1f34b|30|0.7|10.5|0.2|1 EACH|-|67|limes
grapefruit|Grapefruit|citrus|1f34a|42|0.8|10.7|0.1|0.5 EACH|-|246|
lemon-juice|Lemon juice|citrus|1f34b|22|0.4|6.9|0.2|1 TBSP|1.03|-|
lime-juice|Lime juice|citrus|1f34b|25|0.4|8.4|0.1|1 TBSP|1.03|-|
strawberries|Strawberries|berries|1f353|32|0.7|7.7|0.3|1 CUP|0.6|-|strawberry
blueberries|Blueberries|berries|1fad0|57|0.7|14.5|0.3|0.5 CUP|0.65|-|blueberry
raspberries|Raspberries|berries|1f353|52|1.2|11.9|0.7|0.5 CUP|0.5|-|raspberry
blackberries|Blackberries|berries|1fad0|43|1.4|9.6|0.5|0.5 CUP|0.6|-|blackberry
almonds|Almonds|nuts|1f330|579|21.2|21.6|49.9|0.25 CUP|0.6|-|
walnuts|Walnuts|nuts|1f330|654|15.2|13.7|65.2|0.25 CUP|0.45|-|
pecans|Pecans|nuts|1f330|691|9.2|13.9|72|0.25 CUP|0.45|-|
cashews|Cashews|nuts|1f330|553|18.2|30.2|43.9|0.25 CUP|0.6|-|
peanuts|Peanuts|nuts|1f95c|567|25.8|16.1|49.2|0.25 CUP|0.6|-|
pistachios|Pistachios|nuts|1f330|560|20.2|27.2|45.3|0.25 CUP|0.55|-|
pine-nuts|Pine nuts|nuts|1f330|673|13.7|13.1|68.4|2 TBSP|0.55|-|
peanut-butter|Peanut butter|nuts|1f95c|588|25.1|20|50.4|2 TBSP|1.07|-|
almond-butter|Almond butter|nuts|1f330|614|21|18.8|55.5|2 TBSP|1.07|-|
tahini|Tahini|nuts|-|595|17|21.2|53.8|1 TBSP|1.04|-|sesame paste
chia-seeds|Chia seeds|seeds|-|486|16.5|42.1|30.7|1 TBSP|0.7|-|
flax-seeds|Flax seeds|seeds|-|534|18.3|28.9|42.2|1 TBSP|0.65|-|flaxseed
sesame-seeds|Sesame seeds|seeds|-|573|17.7|23.5|49.7|1 TBSP|0.6|-|
sunflower-seeds|Sunflower seeds|seeds|-|584|20.8|20|51.5|0.25 CUP|0.5|-|
pumpkin-seeds|Pumpkin seeds|seeds|-|559|30.2|10.7|49|0.25 CUP|0.5|-|pepitas
white-bread|White bread|bread|1f35e|265|9|49|3.2|1 EACH|-|28|sandwich bread
whole-wheat-bread|Whole wheat bread|bread|1f35e|247|13|41|3.4|1 EACH|-|28|wholemeal bread
flour-tortilla|Flour tortilla|bread|1f32f|304|8.2|49|7.9|1 EACH|-|49|burrito wrap
corn-tortilla|Corn tortilla|bread|1f32e|218|5.7|44.6|2.9|1 EACH|-|26|taco shells
pita|Pita|bread|1fad3|275|9.1|55.7|1.2|1 EACH|-|60|pita bread
bagel|Bagel|bread|1f96f|257|10|50|1.6|1 EACH|-|105|
hamburger-bun|Hamburger bun|bread|1f35e|279|9.9|50|4.3|1 EACH|-|43|burger bun
naan|Naan|bread|1fad3|290|9|50|5.1|1 EACH|-|90|
english-muffin|English muffin|bread|1f35e|227|8.9|44|1.6|1 EACH|-|57|
salt|Salt|spices|1f9c2|0|0|0|0|1 TSP|1.22|-|table salt,sea salt
kosher-salt|Kosher salt|spices|1f9c2|0|0|0|0|1 TSP|0.59|-|
black-pepper|Black pepper|spices|-|251|10.4|64|3.3|1 TSP|0.47|-|ground black pepper,pepper
paprika|Paprika|spices|-|282|14.1|54|13|1 TSP|0.5|-|
smoked-paprika|Smoked paprika|spices|-|282|14.1|54|13|1 TSP|0.5|-|
cayenne|Cayenne pepper|spices|-|318|12|56.6|17.3|0.25 TSP|0.45|-|
chili-powder|Chili powder|spices|-|282|13.5|49.7|14.3|1 TSP|0.5|-|
red-pepper-flakes|Red pepper flakes|spices|-|318|12|56.6|17.3|0.25 TSP|0.35|-|crushed red pepper,chili flakes
cumin|Cumin|spices|-|375|17.8|44.2|22.3|1 TSP|0.46|-|ground cumin
coriander|Coriander|spices|-|298|12.4|55|17.8|1 TSP|0.4|-|ground coriander
turmeric|Turmeric|spices|-|312|9.7|67.1|3.3|1 TSP|0.6|-|
cinnamon|Cinnamon|spices|-|247|4|80.6|1.2|1 TSP|0.55|-|ground cinnamon
nutmeg|Nutmeg|spices|-|525|5.8|49.3|36.3|0.25 TSP|0.54|-|
ground-cloves|Ground cloves|spices|-|274|6|65.5|13|0.25 TSP|0.46|-|cloves
ground-ginger|Ground ginger|spices|-|335|9|71.6|4.2|0.5 TSP|0.35|-|
fresh-ginger|Fresh ginger|spices|1fada|80|1.8|17.8|0.8|1 TBSP|0.9|-|ginger root
garlic-powder|Garlic powder|spices|-|331|16.6|72.7|0.7|0.5 TSP|0.63|-|
onion-powder|Onion powder|spices|-|341|10.4|79.1|1|0.5 TSP|0.5|-|
dried-oregano|Dried oregano|spices|-|265|9|68.9|4.3|1 TSP|0.37|-|oregano
dried-thyme|Dried thyme|spices|-|276|9.1|63.9|7.4|1 TSP|0.28|-|
dried-rosemary|Dried rosemary|spices|-|331|4.9|64.1|15.2|1 TSP|0.3|-|
dried-basil|Dried basil|spices|-|233|23|47.8|4.1|1 TSP|0.14|-|
bay-leaves|Bay leaves|spices|1f343|313|7.6|75|8.4|1 EACH|-|0.6|bay leaf
italian-seasoning|Italian seasoning|spices|-|271|9|68|4.5|1 TSP|0.3|-|
curry-powder|Curry powder|spices|-|325|14.3|55.8|14|1 TSP|0.5|-|
garam-masala|Garam masala|spices|-|379|15|59|15|1 TSP|0.5|-|
cardamom|Cardamom|spices|-|311|10.8|68.5|6.7|0.25 TSP|0.45|-|
allspice|Allspice|spices|-|263|6.1|72.1|8.7|0.25 TSP|0.45|-|
mustard-seed|Mustard seed|spices|-|508|26.1|28.1|36.2|1 TSP|0.65|-|
basil|Basil|herbs|1f33f|23|3.2|2.7|0.6|1 TBSP|0.2|-|fresh basil
cilantro|Cilantro|herbs|1f33f|23|2.1|3.7|0.5|1 TBSP|0.15|-|coriander leaves,fresh cilantro
parsley|Parsley|herbs|1f33f|36|3|6.3|0.8|1 TBSP|0.2|-|fresh parsley
mint|Mint|herbs|1f33f|70|3.8|14.9|0.9|1 TBSP|0.2|-|fresh mint
dill|Dill|herbs|1f33f|43|3.5|7|1.1|1 TBSP|0.2|-|fresh dill
fresh-rosemary|Fresh rosemary|herbs|1f33f|131|3.3|20.7|5.9|1 TSP|0.3|-|rosemary
fresh-thyme|Fresh thyme|herbs|1f33f|101|5.6|24.5|1.7|1 TSP|0.3|-|thyme
chives|Chives|herbs|1f33f|30|3.3|4.4|0.7|1 TBSP|0.2|-|
lemongrass|Lemongrass|herbs|1f33f|99|1.8|25.3|0.5|1 TBSP|0.4|-|
soy-sauce|Soy sauce|sauces|1f96b|53|8.1|4.9|0.6|1 TBSP|1.17|-|shoyu,tamari
ketchup|Ketchup|sauces|1f345|101|1|27.4|0.1|1 TBSP|1.15|-|catsup
yellow-mustard|Yellow mustard|sauces|-|66|4.4|5.8|4|1 TSP|1.05|-|mustard
dijon-mustard|Dijon mustard|sauces|-|60|3.6|5.8|3|1 TSP|1.05|-|
mayonnaise|Mayonnaise|sauces|-|680|1|0.6|75|1 TBSP|0.95|-|mayo
hot-sauce|Hot sauce|sauces|1f336|11|0.5|1.8|0.4|1 TSP|1|-|tabasco
sriracha|Sriracha|sauces|1f336|93|1.9|19|0.9|1 TSP|1.1|-|
bbq-sauce|BBQ sauce|sauces|-|172|0.8|40|0.6|2 TBSP|1.1|-|barbecue sauce
worcestershire-sauce|Worcestershire sauce|sauces|-|78|0|19.5|0|1 TSP|1.1|-|
fish-sauce|Fish sauce|sauces|-|35|5.1|3.6|0|1 TSP|1.2|-|
oyster-sauce|Oyster sauce|sauces|-|51|1.4|11|0.3|1 TBSP|1.3|-|
hoisin-sauce|Hoisin sauce|sauces|-|220|3.3|44|3.4|1 TBSP|1.2|-|
teriyaki-sauce|Teriyaki sauce|sauces|-|89|5.9|15.6|0|1 TBSP|1.1|-|
salsa|Salsa|sauces|1f336|36|1.5|7|0.2|2 TBSP|1.04|-|
hummus|Hummus|sauces|-|166|7.9|14.3|9.6|2 TBSP|1|-|
miso-paste|Miso paste|sauces|-|199|11.7|26.5|6|1 TBSP|1.1|-|miso
jam|Jam|sauces|-|250|0.4|65|0.1|1 TBSP|1.3|-|jelly,preserves
chicken-broth|Chicken broth|broth|1f963|5|0.5|0.4|0.2|1 CUP|1|-|chicken stock
vegetable-broth|Vegetable broth|broth|1f963|6|0.3|1.2|0.1|1 CUP|1|-|vegetable stock
beef-broth|Beef broth|broth|1f963|7|1.1|0.1|0.2|1 CUP|1|-|beef stock
green-olives|Green olives|pickles|1fad2|145|1|3.8|15.3|5 EACH|-|4|olives
dill-pickles|Dill pickles|pickles|1f952|11|0.3|2.3|0.2|1 EACH|-|65|pickles,gherkins
capers|Capers|pickles|-|23|2.4|4.9|0.9|1 TBSP|0.9|-|
tortilla-chips|Tortilla chips|snacks|1f32e|489|7.4|60|24.6|1 OZ|-|-|corn chips
potato-chips|Potato chips|snacks|1f35f|536|7|53|35|1 OZ|-|-|crisps
popcorn|Popcorn|snacks|1f37f|387|13|78|4.5|3 CUP|0.03|-|
granola|Granola|snacks|1f963|471|10|64|20|0.5 CUP|0.4|-|
corn-flakes|Corn flakes|snacks|1f963|357|7|84|0.4|1 CUP|0.1|-|cereal
crackers|Crackers|snacks|-|421|9.5|74|9.4|1 OZ|-|-|saltines
pretzels|Pretzels|snacks|1f968|380|10|79|3.5|1 OZ|-|-|
dark-chocolate|Dark chocolate|snacks|1f36b|598|7.8|45.9|42.6|1 OZ|-|-|
chocolate-chip-cookies|Chocolate chip cookies|snacks|1f36a|488|5.9|63|24|1 EACH|-|30|cookies
vanilla-ice-cream|Vanilla ice cream|snacks|1f368|207|3.5|23.6|11|0.5 CUP|0.55|-|
orange-juice|Orange juice|drinks|1f9c3|45|0.7|10.4|0.2|1 CUP|1.04|-|oj
red-wine|Red wine|drinks|1f377|85|0.1|2.6|0|0.25 CUP|0.99|-|
white-wine|White wine|drinks|1f377|82|0.1|2.6|0|0.25 CUP|0.99|-|
coffee|Coffee|drinks|2615|1|0.1|0|0|1 CUP|1|-|brewed coffee
water|Water|drinks|1f4a7|0|0|0|0|1 CUP|1|-|
`;
