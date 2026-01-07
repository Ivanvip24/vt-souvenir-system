# Remove and then publish each listing
# SPANISH VERSION - Adapted for Spanish Facebook interface

import time

def update_listings(listings, type, scraper):
	# If listings are empty stop the function
	if not listings:
		return

	# Check if listing is already listed and remove it then publish it like a new one
	for listing in listings:
		# Remove listing if it is already published
		remove_listing(listing, type, scraper)

		# Publish the listing in marketplace
		isPublished = publish_listing(listing, type, scraper)

		# If the listing is not published from the first time, try again
		if not isPublished:
			publish_listing(listing, type, scraper)

def remove_listing(data, listing_type, scraper) :
	title = generate_title_for_listing_type(data, listing_type)
	listing_title = find_listing_by_title(title, scraper)

	# Listing not found so stop the function
	if not listing_title:
		return

	listing_title.click()

	# Click on the delete listing button (try Spanish then English)
	delete_selectors = [
		'div:not([role="gridcell"]) > div[aria-label="Eliminar"][tabindex="0"]',
		'div:not([role="gridcell"]) > div[aria-label="Delete"][tabindex="0"]'
	]
	for selector in delete_selectors:
		if scraper.find_element(selector, False, 2):
			scraper.element_click(selector)
			break

	# Click on confirm button to delete
	confirm_selectors = [
		'div[aria-label="Eliminar publicación"] div[aria-label="Eliminar"][tabindex="0"]',
		'div[aria-label="Delete listing"] div[aria-label="Delete"][tabindex="0"]',
		'div[aria-label="Delete Listing"] div[aria-label="Delete"][tabindex="0"]'
	]
	for selector in confirm_selectors:
		if scraper.find_element(selector, False, 2):
			scraper.element_click(selector)
			break

	# Wait until the popup is closed
	scraper.element_wait_to_be_invisible('div[aria-label="Tu publicación"]')
	scraper.element_wait_to_be_invisible('div[aria-label="Your Listing"]')

def publish_listing(data, listing_type, scraper):
	# Choose listing type
	scraper.go_to_page('https://facebook.com/marketplace/create/' + listing_type)

	# Create string that contains all of the image paths separeted by \n
	images_path = generate_multiple_images_path(data['Photos Folder'], data['Photos Names'])
	# Add images to the the listing
	scraper.input_file_add_files('input[accept="image/*,image/heif,image/heic"]', images_path)

	# Add specific fields based on the listing_type
	function_name = 'add_fields_for_' + listing_type
	# Call function by name dynamically
	globals()[function_name](data, scraper)

	# Price field (Spanish: Precio, English: Price)
	price_xpaths = [
		'//span[text()="Precio"]/following-sibling::input[1]',
		'//span[text()="Price"]/following-sibling::input[1]',
		'//label[contains(text(),"Precio")]//following::input[1]',
		'//input[@placeholder="Precio"]'
	]
	for xpath in price_xpaths:
		element = scraper.find_element_by_xpath(xpath, False, 2)
		if element:
			scraper.element_send_keys_by_xpath(xpath, data['Price'])
			break

	# Description field (Spanish: Descripción, English: Description)
	desc_xpaths = [
		'//span[text()="Descripción"]/following-sibling::div/textarea',
		'//span[text()="Description"]/following-sibling::div/textarea',
		'//label[contains(text(),"Descripción")]//following::textarea[1]',
		'//textarea[@placeholder]'
	]
	for xpath in desc_xpaths:
		element = scraper.find_element_by_xpath(xpath, False, 2)
		if element:
			scraper.element_send_keys_by_xpath(xpath, data['Description'])
			break

	# Location field (Spanish: Ubicación, English: Location)
	location_xpaths = [
		'//span[text()="Ubicación"]/following-sibling::input[1]',
		'//span[text()="Location"]/following-sibling::input[1]',
		'//label[contains(text(),"Ubicación")]//following::input[1]'
	]
	for xpath in location_xpaths:
		element = scraper.find_element_by_xpath(xpath, False, 2)
		if element:
			scraper.element_send_keys_by_xpath(xpath, data['Location'])
			break

	scraper.element_click('ul[role="listbox"] li:first-child > div')

	# Next button (Spanish: Siguiente, English: Next)
	next_selectors = [
		'div [aria-label="Siguiente"] > div',
		'div [aria-label="Next"] > div'
	]
	next_button = None
	for selector in next_selectors:
		next_button = scraper.find_element(selector, False, 3)
		if next_button:
			scraper.element_click(selector)
			add_listing_to_multiple_groups(data, scraper)
			break

	# Close button (Spanish: Cerrar, English: Close)
	close_xpaths = [
		'//span[text()="Cerrar"]',
		'//span[text()="Close"]'
	]
	for xpath in close_xpaths:
		close_button = scraper.find_element_by_xpath(xpath, False, 5)
		if close_button:
			scraper.element_click_by_xpath(xpath)
			scraper.go_to_page('https://facebook.com/marketplace/you/selling')
			return False

	# Publish button (Spanish: Publicar, English: Publish)
	publish_selectors = [
		'div[aria-label="Publicar"]:not([aria-disabled])',
		'div[aria-label="Publish"]:not([aria-disabled])'
	]
	for selector in publish_selectors:
		if scraper.find_element(selector, False, 3):
			scraper.element_click(selector)
			break

	# Leave page button (Spanish: Abandonar página, English: Leave Page)
	leave_xpaths = [
		'//div[@tabindex="0"] //span[text()="Abandonar página"]',
		'//div[@tabindex="0"] //span[text()="Salir de la página"]',
		'//div[@tabindex="0"] //span[text()="Leave Page"]'
	]
	for xpath in leave_xpaths:
		leave_page = scraper.find_element_by_xpath(xpath, False, 5)
		if leave_page:
			scraper.element_click_by_xpath(xpath)
			break

	# Wait until the listing is published
	wait_until_listing_is_published(listing_type, scraper)

	if not next_button:
		post_listing_to_multiple_groups(data, listing_type, scraper)

	return True


def generate_multiple_images_path(path, images):
	# Last character must be '/' because after that we are adding the name of the image
	if path[-1] != '/':
		path += '/'

	images_path = ''

	# Split image names into array by this symbol ";"
	image_names = images.split(';')

	# Create string that contains all of the image paths separeted by \n
	if image_names:
		for image_name in image_names:
			# Remove whitespace before and after the string
			image_name = image_name.strip()

			# Add "\n" for indicating new file
			if images_path != '':
				images_path += '\n'

			images_path += path + image_name

	return images_path

# Add specific fields for listing from type vehicle
def add_fields_for_vehicle(data, scraper):
	# Vehicle type (Spanish: Tipo de vehículo)
	vehicle_xpaths = ['//span[text()="Tipo de vehículo"]', '//span[text()="Vehicle type"]']
	for xpath in vehicle_xpaths:
		if scraper.find_element_by_xpath(xpath, False, 2):
			scraper.element_click_by_xpath(xpath)
			break
	scraper.element_click_by_xpath('//span[text()="' + data['Vehicle Type'] + '"]')

	# Year (Spanish: Año)
	year_xpaths = ['//span[text()="Año"]', '//span[text()="Year"]']
	for xpath in year_xpaths:
		if scraper.find_element_by_xpath(xpath, False, 2):
			scraper.scroll_to_element_by_xpath(xpath)
			scraper.element_click_by_xpath(xpath)
			break
	scraper.element_click_by_xpath('//span[text()="' + data['Year'] + '"]')

	# Make (Spanish: Marca)
	make_xpaths = ['//span[text()="Marca"]/following-sibling::input[1]', '//span[text()="Make"]/following-sibling::input[1]']
	for xpath in make_xpaths:
		if scraper.find_element_by_xpath(xpath, False, 2):
			scraper.element_send_keys_by_xpath(xpath, data['Make'])
			break

	# Model (Spanish: Modelo)
	model_xpaths = ['//span[text()="Modelo"]/following-sibling::input[1]', '//span[text()="Model"]/following-sibling::input[1]']
	for xpath in model_xpaths:
		if scraper.find_element_by_xpath(xpath, False, 2):
			scraper.element_send_keys_by_xpath(xpath, data['Model'])
			break

	# Mileage (Spanish: Kilometraje)
	mileage_xpaths = ['//span[text()="Kilometraje"]/following-sibling::input[1]', '//span[text()="Mileage"]/following-sibling::input[1]']
	for xpath in mileage_xpaths:
		if scraper.find_element_by_xpath(xpath, False, 2):
			scraper.scroll_to_element_by_xpath(xpath)
			scraper.element_send_keys_by_xpath(xpath, data['Mileage'])
			break

	# Fuel type (Spanish: Tipo de combustible)
	fuel_xpaths = ['//span[text()="Tipo de combustible"]', '//span[text()="Fuel type"]']
	for xpath in fuel_xpaths:
		if scraper.find_element_by_xpath(xpath, False, 2):
			scraper.element_click_by_xpath(xpath)
			break
	scraper.element_click_by_xpath('//span[text()="' + data['Fuel Type'] + '"]')

# Add specific fields for listing from type item
def add_fields_for_item(data, scraper):
	# Title field (Spanish: Título, English: Title)
	title_xpaths = [
		'//span[text()="Título"]/following-sibling::input[1]',
		'//span[text()="Title"]/following-sibling::input[1]',
		'//label[contains(text(),"Título")]//following::input[1]'
	]
	for xpath in title_xpaths:
		element = scraper.find_element_by_xpath(xpath, False, 3)
		if element:
			scraper.element_send_keys_by_xpath(xpath, data['Title'])
			break

	# Category field (Spanish: Categoría, English: Category)
	category_xpaths = ['//span[text()="Categoría"]', '//span[text()="Category"]']
	for xpath in category_xpaths:
		if scraper.find_element_by_xpath(xpath, False, 2):
			scraper.scroll_to_element_by_xpath(xpath)
			scraper.element_click_by_xpath(xpath)
			time.sleep(1)  # Wait for dropdown to open
			break

	# Select category - try both Spanish and English versions
	category = data['Category']
	category_mapping = {
		'Home & Garden': 'Hogar y jardín',
		'Electronics': 'Electrónica',
		'Clothing': 'Ropa',
		'Sports & Outdoors': 'Deportes y actividades al aire libre',
		'Toys & Games': 'Juguetes y juegos',
		'Health & Beauty': 'Salud y belleza'
	}
	spanish_category = category_mapping.get(category, category)

	category_found = False
	# Try multiple selector patterns for category
	for cat in [spanish_category, category]:
		category_selectors = [
			'//span[text()="' + cat + '"]',
			'//div[contains(@role,"option")]//span[text()="' + cat + '"]',
			'//div[contains(text(),"' + cat + '")]',
			'//*[contains(text(),"' + cat + '")]'
		]
		for selector in category_selectors:
			if scraper.find_element_by_xpath(selector, False, 2):
				scraper.element_click_by_xpath(selector)
				category_found = True
				break
		if category_found:
			break

	if not category_found:
		# Try clicking any visible category option (multiple fallback selectors)
		fallback_selectors = [
			'div[role="listbox"] div[role="option"]:first-child',
			'div[role="option"]',
			'[role="listbox"] [role="option"]'
		]
		for selector in fallback_selectors:
			if scraper.find_element(selector, False, 3):
				scraper.element_click(selector, True, False)
				break

	# Condition field (Spanish: Estado, English: Condition)
	condition_xpaths = ['//div/span[text()="Estado"]', '//div/span[text()="Condition"]']
	for xpath in condition_xpaths:
		if scraper.find_element_by_xpath(xpath, False, 2):
			scraper.element_click_by_xpath(xpath)
			break

	# Select condition - try both Spanish and English versions
	condition = data['Condition']
	condition_mapping = {
		'New': 'Nuevo',
		'Used - Like New': 'Usado - Como nuevo',
		'Used - Good': 'Usado - Buen estado',
		'Used - Fair': 'Usado - Aceptable'
	}
	spanish_condition = condition_mapping.get(condition, condition)

	for cond in [spanish_condition, condition]:
		if scraper.find_element_by_xpath('//span[@dir="auto"][text()="' + cond + '"]', False, 2):
			scraper.element_click_by_xpath('//span[@dir="auto"][text()="' + cond + '"]')
			break

	# Brand field for Sports & Outdoors category
	if data['Category'] in ['Sports & Outdoors', 'Deportes y actividades al aire libre']:
		brand_xpaths = ['//span[text()="Marca"]/following-sibling::input[1]', '//span[text()="Brand"]/following-sibling::input[1]']
		for xpath in brand_xpaths:
			if scraper.find_element_by_xpath(xpath, False, 2):
				scraper.element_send_keys_by_xpath(xpath, data['Brand'])
				break

def generate_title_for_listing_type(data, listing_type):
	title = ''

	if listing_type == 'item':
		title = data['Title']

	if listing_type == 'vehicle':
		title = data['Year'] + ' ' + data['Make'] + ' ' + data['Model']

	return title

def add_listing_to_multiple_groups(data, scraper):
	# Create an array for group names by spliting the string by this symbol ";"
	group_names = data['Groups'].split(';')

	# If the groups are empty do not do nothing
	if not group_names:
		return

	# Post in different groups
	for group_name in group_names:
		# Remove whitespace before and after the name
		group_name = group_name.strip()

		scraper.element_click_by_xpath('//span[text()="' + group_name + '"]')

def post_listing_to_multiple_groups(data, listing_type, scraper):
	title = generate_title_for_listing_type(data, listing_type)
	title_element = find_listing_by_title(title, scraper)

	# If there is no add with this title do not do nothing
	if not title_element:
		return

	# Create an array for group names by spliting the string by this symbol ";"
	group_names = data['Groups'].split(';')

	# If the groups are empty do not do nothing
	if not group_names:
		return

	# Search input (Spanish and English)
	search_selectors = ['[aria-label="Buscar grupos"]', '[aria-label="Search for groups"]']

	# Post in different groups
	for group_name in group_names:
		# Click on the Share button to the listing that we want to share
		scraper.element_click_by_xpath('//*[contains(@aria-label, "' + title + '")]//span//span[contains(., "Compartir")]')

		# Click on the Share to a group button
		share_xpaths = ['//span[text()="Grupo"]', '//span[text()="Group"]']
		for xpath in share_xpaths:
			if scraper.find_element_by_xpath(xpath, False, 2):
				scraper.element_click_by_xpath(xpath)
				break

		# Remove whitespace before and after the name
		group_name = group_name.strip()

		# Find and use search input
		for selector in search_selectors:
			if scraper.find_element(selector, False, 2):
				scraper.element_delete_text(selector)
				scraper.element_send_keys(selector, group_name[:51])
				break

		scraper.element_click_by_xpath('//span[text()="' + group_name + '"]')

		# Write post content
		post_selectors = [
			'[aria-label="Crea una publicación pública…"]',
			'[aria-label="Create a public post…"]',
			'[aria-label="Escribe algo..."]',
			'[aria-label="Write something..."]'
		]
		for selector in post_selectors:
			if scraper.find_element(selector, False, 2):
				scraper.element_send_keys(selector, data['Description'])
				break

		# Post button
		post_selectors = ['[aria-label="Publicar"]:not([aria-disabled])', '[aria-label="Post"]:not([aria-disabled])']
		for selector in post_selectors:
			if scraper.find_element(selector, False, 2):
				scraper.element_click(selector)
				break

		# Wait till the post is posted successfully
		scraper.element_wait_to_be_invisible('[role="dialog"]')
		scraper.element_wait_to_be_invisible('[aria-label="Cargando..."]')
		scraper.element_wait_to_be_invisible('[aria-label="Loading...]"')

		# Check for success message
		success_xpaths = ['//span[text()="Compartido en tu grupo."]', '//span[text()="Shared to your group."]']
		for xpath in success_xpaths:
			scraper.find_element_by_xpath(xpath, False, 5)

def find_listing_by_title(title, scraper):
	# Search input (Spanish and English)
	search_placeholders = ['input[placeholder="Busca tus publicaciones"]', 'input[placeholder="Search your listings"]']

	searchInput = None
	for placeholder in search_placeholders:
		searchInput = scraper.find_element(placeholder, False, 2)
		if searchInput:
			scraper.element_delete_text(placeholder)
			scraper.element_send_keys(placeholder, title)
			break

	if not searchInput:
		return False

	return scraper.find_element_by_xpath('//span[text()="' + title + '"]', False, 10)

def wait_until_listing_is_published(listing_type, scraper):
	if listing_type == 'item':
		# Wait for Spanish or English version
		scraper.element_wait_to_be_invisible_by_xpath('//h1[text()="Artículo en venta"]')
		scraper.element_wait_to_be_invisible_by_xpath('//h1[text()="Item for sale"]')
	elif listing_type == 'vehicle':
		scraper.element_wait_to_be_invisible_by_xpath('//h1[text()="Vehículo en venta"]')
		scraper.element_wait_to_be_invisible_by_xpath('//h1[text()="Vehicle for sale"]')
