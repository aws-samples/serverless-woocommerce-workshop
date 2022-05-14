<?php

function get_all_directory_and_files($dir){
    $php_files = array();

    foreach (new DirectoryIterator($dir) as $item) {
        if ($item->isDot()) 
            continue; 

        if ($item->isDir()) {
            // skip aws-sdk-php
            if (strcmp($item->getFilename(), "aws-sdk-php") == 0) 
                continue;
            // recurse into sub directories
            array_push($php_files, ...get_all_directory_and_files("$dir/$item"));
        } else if (fnmatch('*.php', $item->getFilename())) {
            array_push($php_files, $item->getRealPath());
            // echo $item->getRealPath() . PHP_EOL;
        }
     }

     return $php_files;
}

$entry = empty($argv[1]) ? '/srv/bedrock/' : $argv[1];
$files = get_all_directory_and_files($entry);
$count_of_files = count($files);
echo 'Total ' . $count_of_files . ' php files' . PHP_EOL;

$compiled = 0;
$failed = 0;
foreach ($files as $file) {
    try {
        // echo 'Priming ' . $file . PHP_EOL;
        if (@opcache_compile_file($file)) {
            $compiled++;
            // echo "Success!" . PHP_EOL;
            continue;
        }
    } catch (Throwable $e) {
    }

    // ignore errors
    $failed++;
    // echo 'Could not compile: '. $file . PHP_EOL;
}

echo 'Cached ' . $compiled . ' files' . PHP_EOL;
echo 'Skipped: ' . $failed . ' files' . PHP_EOL;
