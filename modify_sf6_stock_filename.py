import os
import re

def rename_sf6_files(directory):
    for filename in os.listdir(directory):
        # Match pattern: {size}px-SF6_{CharacterName}_Icon{.ext}
        match = re.match(r'\d+px-SF6_(.+?)_Icon\.(.+)', filename, re.IGNORECASE)
        
        if match:
            character_name = match.group(1).lower()
            extension = match.group(2).lower()
            new_filename = f"{character_name}.{extension}"
            
            old_path = os.path.join(directory, filename)
            new_path = os.path.join(directory, new_filename)

            if old_path != new_path:
                os.rename(old_path, new_path)
                print(f"Renamed: {filename} → {new_filename}")

if __name__ == "__main__":
    target_directory = "./sf6_icons"  # Change this to your folder path
    rename_sf6_files(target_directory)