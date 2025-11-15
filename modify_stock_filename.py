import os

def rename_files_ending_in_1(directory):
    for filename in os.listdir(directory):
        base, ext = os.path.splitext(filename)
        if base.endswith('1'):
            new_base = base[:-1].lower()  # Remove trailing '1' and lowercase
            new_filename = new_base + ext.lower()
            old_path = os.path.join(directory, filename)
            new_path = os.path.join(directory, new_filename)

            if old_path != new_path:
                os.rename(old_path, new_path)
                print(f"Renamed: {filename} → {new_filename}")

if __name__ == "__main__":
    target_directory = "./stock_icons"  # Change this to your folder path
    rename_files_ending_in_1(target_directory)
