
<?php
/*
Plugin Name: S3 Uploads Session Token
Description: configure Session Token for S3 Uploads
Version: 1.0
Author: Harold Sun
*/

use function Env\env;

add_filter( 's3_uploads_s3_client_params', function ( $params ) {
	$params['credentials']['token'] = env('AWS_SESSION_TOKEN');
	return $params;
} );

?>