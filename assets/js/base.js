window.coachella = angular.module('coachella', ['ui.bootstrap', 'firebase'])

	.controller('BandsCtrl', function($scope, $firebase) {
		var bandsRef = new Firebase('https://coachellalp.firebaseio.com/bands');
		$scope.bands = $firebase(bandsRef);
		
	})
	
	.directive('fbLogin', function() {
		return {
			link: function(scope, element, attrs) {
				var ref = new Firebase('https://coachellalp.firebaseio.com');
				var auth = new FirebaseSimpleLogin(ref, function(error, user) {
					if (error) {
						console.log(error);
					} else if (user) {
						console.log('User ID: ' + user.id + ', Provider: ' + user.provider);
					} else {
						// logout
						element.on('click', function(e){
							e.preventDefault();
							
							auth.login('facebook');
						});
					}
				});
			},
		};
	})
	;